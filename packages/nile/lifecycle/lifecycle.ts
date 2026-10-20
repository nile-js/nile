import { Err, Ok, safeTry } from "slang-ts";
import type {
  LifecycleResource,
  LifecycleState,
  NileLifecycle,
  ShutdownReport,
} from "./types";

/** Own work admission and resource cleanup without installing global signal handlers. */
export function createLifecycle(): NileLifecycle {
  let state: LifecycleState = "initializing";
  const active = new Set<AbortController>();
  const resources = new Set<LifecycleResource>();
  const idle = new Set<() => void>();
  let shutdown: Promise<ShutdownReport> | undefined;

  const waitForIdle = () =>
    active.size
      ? new Promise<void>((resolve) => idle.add(resolve))
      : Promise.resolve();

  const stop = async (timeoutMs: number): Promise<ShutdownReport> => {
    state = "draining";
    const snapshot = [...resources];
    const errors: string[] = [];
    const deadline = Date.now() + timeoutMs;
    const cleanupSignal = new AbortController();
    let timedOut = false;

    const bounded = async (work: Promise<void>) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        work,
        new Promise<void>((resolve) => {
          timer = setTimeout(
            () => {
              timedOut = true;
              resolve();
            },
            Math.max(0, deadline - Date.now())
          );
        }),
      ]);
      if (timer) {
        clearTimeout(timer);
      }
    };
    const call = async (
      resource: LifecycleResource,
      phase: "stop" | "drain" | "close"
    ) => {
      const result = await safeTry(() =>
        resource[phase]?.(cleanupSignal.signal)
      );
      if (result.isErr) {
        errors.push(`${resource.name}: ${phase} failed`);
      }
    };
    // Invoke every stop before yielding: listeners and schedulers close admission together.
    await bounded(
      Promise.all(snapshot.map((resource) => call(resource, "stop"))).then(
        () => undefined
      )
    );
    if (!timedOut) {
      await bounded(
        Promise.all([
          waitForIdle(),
          ...snapshot.map((resource) => call(resource, "drain")),
        ]).then(() => undefined)
      );
    }
    if (timedOut) {
      cleanupSignal.abort();
      for (const controller of active) {
        controller.abort();
      }
    }
    // Cleanup still runs after a drain timeout, with an already-aborted signal.
    await bounded(
      Promise.all(
        snapshot.reverse().map((resource) => call(resource, "close"))
      ).then(() => undefined)
    );
    state = "stopped";
    resources.clear();
    idle.clear();
    return { timedOut, errors: [...errors], remainingExecutions: active.size };
  };

  return {
    state: () => state,
    isReady: () => state === "ready",
    active: () => active.size,
    ready() {
      if (state !== "initializing") {
        throw new Error("Lifecycle can become ready only once");
      }
      state = "ready";
    },
    register(resource) {
      if (state === "draining" || state === "stopped") {
        throw new Error("Cannot register a resource during shutdown");
      }
      if (!resource.name) {
        throw new Error("Lifecycle resources need a name");
      }
      resources.add(resource);
      return () => {
        resources.delete(resource);
      };
    },
    enter(signal, parentSignal) {
      const nested =
        parentSignal &&
        [...active].some((entry) => entry.signal === parentSignal);
      if (state === "stopped" || (state === "draining" && !nested)) {
        return Err("Nile is shutting down");
      }
      if (signal?.aborted) {
        return Err("Execution cancelled");
      }
      const controller = new AbortController();
      const cancel = () => controller.abort();
      signal?.addEventListener("abort", cancel, { once: true });
      active.add(controller);
      let finished = false;
      return Ok({
        signal: controller.signal,
        finish() {
          if (finished) {
            return;
          }
          finished = true;
          signal?.removeEventListener("abort", cancel);
          active.delete(controller);
          if (!active.size) {
            for (const resolve of idle) {
              resolve();
            }
            idle.clear();
          }
        },
      });
    },
    shutdown({ timeoutMs = 10_000 } = {}) {
      if (
        !Number.isSafeInteger(timeoutMs) ||
        timeoutMs < 1 ||
        timeoutMs > 2_147_483_647
      ) {
        throw new Error(
          "Shutdown timeoutMs must be a positive bounded integer"
        );
      }
      shutdown ??= stop(timeoutMs);
      return shutdown;
    },
  };
}
