import { Err, Ok, safeTry } from "slang-ts";
import type { Engine } from "../engine/types";
import type { NileLifecycle } from "../lifecycle/types";
import { getRequestStore, runInRequestScope } from "../nile/request-scope";
import type { NileContext } from "../nile/types";
import { createRequestId } from "./correlation";
import type {
  ExecutionContext,
  ExecutionDetails,
  ExecutionOptions,
} from "./types";

type ActionResult = Awaited<ReturnType<Engine["executeAction"]>>;

/** Compose admission, diagnostics and cancellation around the existing action pipeline. */
export function createExecutionRuntime({
  lifecycle,
  context,
  options = {},
}: {
  lifecycle: NileLifecycle;
  context: NileContext;
  options?: ExecutionOptions;
}) {
  const timeoutMs = options.timeoutMs;
  if (
    timeoutMs !== undefined &&
    (!Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 1 ||
      timeoutMs > 2_147_483_647)
  ) {
    throw new Error("Execution timeoutMs must be a positive bounded integer");
  }
  const diagnostics = { slowMs: 1000, ...options.diagnostics };
  const logger = context.resources?.logger;
  if (logger?.flush || logger?.close) {
    lifecycle.register({
      name: "logger",
      drain: logger.flush,
      close: logger.close,
    });
  }
  if (
    diagnostics?.slowMs !== undefined &&
    !(Number.isFinite(diagnostics.slowMs) && diagnostics.slowMs >= 0)
  ) {
    throw new Error("Slow execution threshold must be finite and nonnegative");
  }
  if (diagnostics?.telemetry) {
    lifecycle.register({
      name: "telemetry",
      drain: diagnostics.telemetry.flush,
      close: diagnostics.telemetry.shutdown,
    });
  }
  const checkQuota =
    options.rateLimit || options.services
      ? async (service: string, action: string) => {
          const policy =
            options.services?.[service]?.actions?.[action]?.rateLimit ??
            options.services?.[service]?.rateLimit ??
            options.rateLimit;
          if (!policy) {
            return Ok(undefined);
          }
          const execution = getRequestStore()?.execution;
          if (!execution) {
            return Err("Action execution context unavailable");
          }
          const checked = await safeTry(() => {
            const key = policy.key({ service, action, context: execution });
            return policy.store.consume({ key });
          });
          if (checked.isErr) {
            return Err("Rate limit service unavailable");
          }
          return checked.value.allowed
            ? Ok(undefined)
            : Err(
                `Rate limit exceeded; retry after ${checked.value.retryAfterMs}ms`
              );
        }
      : undefined;

  const summarize = async (
    details: ExecutionDetails,
    result: ActionResult,
    durationMs: number
  ) => {
    const slow =
      diagnostics?.slowMs !== undefined && durationMs >= diagnostics.slowMs;
    if (result.isOk && !slow && !diagnostics?.summaries) {
      return;
    }
    const logger = context.resources?.logger;
    if (!logger) {
      return;
    }
    let level: "info" | "warn" | "error" = "info";
    let message = "Action completed";
    if (slow) {
      level = "warn";
      message = "Slow action completed";
    }
    if (result.isErr) {
      level = "error";
      message = "Action failed";
    }
    await safeTry(() =>
      logger[level]({
        atFunction: `${details.service}.${details.action}`,
        message,
        data: {
          requestId: details.context.requestId,
          transport: details.context.transport,
          durationMs,
          status: result.isOk,
        },
      })
    );
  };

  const execute = (
    service: string,
    action: string,
    run: () => Promise<ActionResult>
  ): Promise<ActionResult> => {
    const parent = getRequestStore();
    const request = parent?.nativeRest?.request ?? parent?.rest?.req.raw;
    const incoming = parent?.execution;
    const admission = lifecycle.enter(
      incoming?.signal ?? request?.signal,
      parent?.admissionSignal
    );
    if (admission.isErr) {
      return Promise.resolve(Err(admission.error));
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    admission.value.signal.addEventListener("abort", abort, { once: true });
    const execution: ExecutionContext = {
      ...incoming,
      requestId:
        incoming?.requestId ??
        createRequestId(request?.headers.get("x-request-id")),
      transport: incoming?.transport ?? "rest",
      signal: controller.signal,
      headers: incoming?.headers ?? request?.headers,
    };
    const details = { service, action, context: execution };
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onCancel!: () => void;
    const cancelled = new Promise<ActionResult>((resolve) => {
      onCancel = () =>
        resolve(
          Err(
            controller.signal.reason === "timeout"
              ? "Action execution timed out"
              : "Execution cancelled"
          )
        );
      controller.signal.addEventListener("abort", onCancel, { once: true });
    });
    const work = runInRequestScope(
      {
        ...parent,
        context,
        admissionSignal: admission.value.signal,
        sessions: parent?.sessions ?? {},
        execution,
      },
      async () => {
        const startedAt = performance.now();
        const spanResult = diagnostics?.telemetry
          ? await safeTry(() => diagnostics.telemetry?.start(details))
          : undefined;
        const span = spanResult?.isOk ? spanResult.value : undefined;
        if (span) {
          execution.traceId = span.traceId;
          execution.spanId = span.spanId;
        }
        const store = getRequestStore();
        if (store && diagnostics?.hookTracing && diagnostics.telemetry) {
          const telemetry = diagnostics.telemetry;
          store.traceHook = async <T>(name: string, fn: () => Promise<T>) => {
            const started = await safeTry(() =>
              telemetry.start({ ...details, hook: name })
            );
            if (started.isErr) {
              return fn();
            }
            const hookStart = performance.now();
            const value = await started.value.run(fn);
            await safeTry(() =>
              started.value.end({
                success: !(
                  value &&
                  typeof value === "object" &&
                  "isErr" in value &&
                  value.isErr === true
                ),
                durationMs: performance.now() - hookStart,
              })
            );
            return value;
          };
        }
        const result = await safeTry(() => (span ? span.run(run) : run()));
        const durationMs = performance.now() - startedAt;
        if (span) {
          await safeTry(() => span.end({ success: result.isOk, durationMs }));
        }
        if (diagnostics) {
          await summarize(details, result, durationMs);
        }
        return result;
      }
    );
    const settled = Promise.resolve(work).then((result) => {
      if (timer) {
        clearTimeout(timer);
      }
      admission.value.signal.removeEventListener("abort", abort);
      controller.signal.removeEventListener("abort", onCancel);
      admission.value.finish();
      return result;
    });
    if (timeoutMs !== undefined) {
      timer = setTimeout(() => controller.abort("timeout"), timeoutMs);
    }
    return Promise.race([settled, cancelled]);
  };
  return { execute, checkQuota };
}
