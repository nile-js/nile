import { Err, Ok, type Result, safeTry } from "slang-ts";
import { prettifyError } from "zod";
import type {
  AfterActionHandler,
  BeforeActionHandler,
  NileContext,
} from "@/nile/types";
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
  const result = await safeTry(() =>
    hookAction.handler(input as Record<string, unknown>, nileContext)
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

  const result = await safeTry(() => handler({ nileContext, action, payload }));
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

  const result = await safeTry(() =>
    handler({
      nileContext,
      action,
      payload,
      result: Ok(currentResult),
    })
  );
  if (result.isErr) {
    log(`Global after hook failed for ${action.name}`);
    nileContext.setHookError(result.error);
    return Err(result.error);
  }

  return Ok(result.value);
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
    return Err(`Validation failed: ${validationError}`);
  }

  return Ok(parseResult.data);
}

/**
 * Execute the main action handler, wrapped in safeTry for crash safety
 */
export async function runHandler(
  action: Action,
  payload: unknown,
  nileContext: NileContext,
  log: (msg: string, data?: unknown) => void
): Promise<Result<unknown, string>> {
  const result = await safeTry(() =>
    action.handler(payload as Record<string, unknown>, nileContext)
  );

  if (result.isErr) {
    log(`Handler failed for ${action.name}`, result.error);
    nileContext.setHookError(result.error);
    return Err(result.error);
  }

  nileContext.setHookOutput(result.value);
  return Ok(result.value);
}
