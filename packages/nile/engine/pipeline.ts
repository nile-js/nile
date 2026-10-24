import { Err, Ok, type Result, safeTry } from "slang-ts";
import { prettifyError } from "zod";
import { getRequestStore } from "@/nile/request-scope";
import type {
  AfterActionHandler,
  BeforeActionHandler,
  NileContext,
} from "@/nile/types";
import { runObservedHook } from "../execution/hook-tracing";
import type { Action, HookDefinition, HookLogEntry } from "./types";

/**
 * Executes a single hook and logs the result
 */
async function runHook(
  hookDef: HookDefinition,
  hookAction: Action,
  input: unknown,
  nileContext: NileContext
): Promise<{ result: Result<unknown, string>; logEntry: HookLogEntry }> {
  const result = await runObservedHook(
    `${hookDef.service}.${hookDef.action}`,
    () =>
      safeTry(() =>
        hookAction.handler(input as Record<string, unknown>, nileContext)
      )
  );
  return {
    result,
    logEntry: {
      name: `${hookDef.service}.${hookDef.action}`,
      input,
      output: result.isOk ? result.value : result.error,
      passed: result.isOk,
    },
  };
}

/**
 * Process hooks sequentially, each hook output becomes the next input
 */
export async function processHooks(
  hooks: HookDefinition[],
  initialValue: unknown,
  getAction: (service: string, action: string) => Result<Action, string>,
  nileContext: NileContext,
  logTarget: "before" | "after",
  log: (msg: string, data?: unknown) => void
): Promise<Result<unknown, string>> {
  let currentValue = initialValue;

  for (const hookDef of hooks) {
    const hookActionResult = getAction(hookDef.service, hookDef.action);

    if (hookActionResult.isErr) {
      const errorMsg = `${logTarget} hook '${hookDef.service}.${hookDef.action}' not found`;
      log(errorMsg);
      if (hookDef.isCritical) {
        nileContext.setHookError(errorMsg);
        return Err(errorMsg);
      }
      continue;
    }

    const { result, logEntry } = await runHook(
      hookDef,
      hookActionResult.value,
      currentValue,
      nileContext
    );
    nileContext.addHookLog(logTarget, logEntry);

    if (result.isErr) {
      const errorMsg = String(result.error);
      log(
        `${logTarget} hook '${hookDef.service}.${hookDef.action}' failed`,
        result.error
      );
      if (hookDef.isCritical) {
        nileContext.setHookError(errorMsg);
        return Err(errorMsg);
      }
      continue;
    }

    currentValue = result.value;
  }

  return Ok(currentValue);
}

/**
 * Run global before hook if configured, wrapped in safeTry for crash safety
 */
export async function runGlobalBeforeHook(
  handler: BeforeActionHandler<unknown, unknown> | undefined,
  nileContext: NileContext,
  action: Action,
  payload: unknown,
  log: (msg: string) => void
): Promise<Result<true, string>> {
  if (!handler) {
    return Ok(true);
  }

  const result = await runObservedHook("global.before", () =>
    safeTry(() => handler({ nileContext, action, payload }))
  );
  if (result.isErr) {
    log(`Global before hook failed for ${action.name}`);
    nileContext.setHookError(result.error);
    return Err(result.error);
  }

  return Ok(true);
}

/**
 * Run global after hook if configured, wrapped in safeTry for crash safety
 */
export async function runGlobalAfterHook(
  handler: AfterActionHandler<unknown, unknown> | undefined,
  nileContext: NileContext,
  action: Action,
  payload: unknown,
  currentResult: unknown,
  log: (msg: string) => void
): Promise<Result<unknown, string>> {
  if (!handler) {
    return Ok(currentResult);
  }

  const result = await runObservedHook("global.after", () =>
    safeTry(() =>
      handler({
        nileContext,
        action,
        payload,
        result: Ok(currentResult),
      })
    )
  );
  if (result.isErr) {
    log(`Global after hook failed for ${action.name}`);
    nileContext.setHookError(result.error);
    return result;
  }

  return result;
}

/**
 * Validate payload against action's Zod schema
 */
export function validatePayload(
  action: Action,
  payload: unknown,
  nileContext: NileContext,
  log: (msg: string, data?: unknown) => void
): Result<unknown, string> {
  if (!action.validation) {
    return Ok(payload);
  }

  const parseResult = action.validation.safeParse(payload);
  if (!parseResult.success) {
    const validationError = prettifyError(parseResult.error);
    log(`Validation failed for ${action.name}`, validationError);
    nileContext.setHookError(validationError);
    // Transports that opted in return these per-field issues alongside the message.
    const failure = getRequestStore()?.failure;
    if (failure) {
      failure.validationIssues = parseResult.error.issues.map((issue) => ({
        path: issue.path.map(String).join("."),
        message: issue.message,
      }));
    }
    return Err(`Validation failed: ${validationError}`);
  }

  return Ok(parseResult.data);
}

/** The message a handler attached with `Ok(value, message)`, if it returned one. */
function readSuccessMessage(returned: unknown): string | undefined {
  if (returned === null || typeof returned !== "object") {
    return undefined;
  }
  const candidate = returned as { isOk?: unknown; message?: unknown };
  return candidate.isOk === true && typeof candidate.message === "string"
    ? candidate.message
    : undefined;
}

/**
 * Execute the main action handler, wrapped in safeTry for crash safety.
 * safeTry rebuilds the Result, so the handler's own success message is read before that.
 */
export async function runHandler(
  action: Action,
  payload: unknown,
  nileContext: NileContext,
  log: (msg: string, data?: unknown) => void
): Promise<{ result: Result<unknown, string>; successMessage?: string }> {
  let successMessage: string | undefined;
  const result = await safeTry(async () => {
    const returned = await action.handler(
      payload as Record<string, unknown>,
      nileContext
    );
    successMessage = readSuccessMessage(returned);
    return returned;
  });

  if (result.isErr) {
    log(`Handler failed for ${action.name}`, result.error);
    nileContext.setHookError(result.error);
    return { result };
  }

  nileContext.setHookOutput(result.value);
  return { result, successMessage };
}

/**
 * Record the success message for transports that report one. Every action writes it as its
 * last step, so an outer action overrides, or clears, a message left by actions it called.
 */
export function recordSuccessMessage(message: string | undefined): void {
  const success = getRequestStore()?.success;
  if (success) {
    success.message = message;
  }
}
