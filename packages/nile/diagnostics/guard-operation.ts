import { Err, safeTry } from "slang-ts";
import { getRequestStore } from "../nile/request-scope";
import type { NileLogger } from "../nile/types";
import { describeError } from "./describe-error";
import { createErrorCode, formatErrorMessage } from "./error-code";

/** Contain throws and Slang panics without changing intentional Result failures. */
export async function guardOperation<T>(
  operation: () => T | Promise<T>,
  options: { logger?: NileLogger; atFunction?: string; message?: string } = {}
): ReturnType<typeof safeTry<T>> {
  let didThrow = false;
  let cause: unknown;
  let returned: unknown;
  try {
    const result = await safeTry(async () => {
      try {
        returned = await operation();
        return returned;
      } catch (error) {
        didThrow = true;
        cause = error;
        throw error;
      }
    });
    const returnedFailure =
      returned !== null &&
      typeof returned === "object" &&
      Reflect.get(returned, "isErr") === true;
    if (
      !(
        didThrow ||
        (result.isErr && result.raw !== undefined && !returnedFailure)
      )
    ) {
      return result as Awaited<ReturnType<typeof safeTry<T>>>;
    }
    cause ??= result.raw;
  } catch (error) {
    // Slang deliberately rethrows nested-Result panics; framework boundaries must contain them.
    cause = error;
  }
  const message = options.message ?? "could not complete the action";
  const errorCode = createErrorCode();
  try {
    const logger =
      options.logger ?? getRequestStore()?.context?.resources?.logger;
    const report = {
      log_id: errorCode,
      atFunction: options.atFunction ?? "nile.operation",
      message,
      data: { diagnostic: await describeError(cause) },
    };
    if (logger) {
      await logger.error(report);
    } else {
      console.error("[Nile]", report);
    }
  } catch {
    // Diagnostic failures cannot replace a safe failure or prevent execution cleanup.
  }
  return Err(formatErrorMessage(errorCode, message)) as Awaited<
    ReturnType<typeof safeTry<T>>
  >;
}
