import { Err, type ErrType, type ResultMethods } from "slang-ts";
import { getContext } from "@/nile/server";
import type { NileLogger } from "@/nile/types";

/**
 * Parameters for the handleError utility.
 *
 * @property message - Human-readable error description, included in the returned Result error string
 * @property data - Optional structured data logged alongside the error for debugging
 * @property logger - Explicit logger instance; when omitted, resolves from the current Nile request context
 * @property atFunction - Name of the calling function for log attribution; auto-inferred from stack trace when omitted
 */
export interface HandleErrorParams {
  message: string;
  data?: unknown;
  logger?: NileLogger;
  atFunction?: string;
}

const CALLER_LINE_REGEX = /at\s+(\S+)\s+/;

function inferCallerName(): string {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _err = new Error("capture stack trace");
  const stack = _err.stack;
  const callerLine = stack?.split("\n")[3] ?? "";
  const match = callerLine.match(CALLER_LINE_REGEX);
  return match?.[1] ?? "unknown";
}

function resolveLogger(explicit?: NileLogger): NileLogger {
  if (explicit) {
    return explicit;
  }
  try {
    const ctx = getContext();
    if (ctx.resources?.logger) {
      return ctx.resources.logger;
    }
  } catch (_) {
    // Fall through to throw
  }
  throw new Error(
    "handleError: No logger available. Provide a logger param or set resources.logger on server config."
  );
}

/**
 * Logs an error via the resolved logger and returns a typed Err result.
 * Resolves the logger from the current Nile request context when not provided explicitly.
 * The returned error string includes the log ID for traceability: `[logId] message`.
 *
 * @param params - Error details including message, optional data, logger, and caller function name
 * @returns Always an Err variant — `ErrType<string> & ResultMethods<never>`, compatible with any `Result<T, E>` union
 *
 * @example
 * ```typescript
 * if (!user) {
 *   return handleError({
 *     message: "User not found",
 *     data: { userId },
 *     atFunction: "getUserById",
 *   });
 * }
 * ```
 */
export function handleError(
  params: HandleErrorParams
): ErrType<string> & ResultMethods<never> {
  const atFunction = params.atFunction ?? inferCallerName();
  const logger = resolveLogger(params.logger);
  const logId = logger.error({
    atFunction,
    message: params.message,
    data: params.data,
  });
  return Err(`[${logId}] ${params.message}`);
}
