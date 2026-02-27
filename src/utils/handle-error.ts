import { Err, type Err as ErrType } from "slang-ts";
import { getContext } from "@/nile/server";
import type { NileLogger } from "@/nile/types";

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

export function handleError(params: HandleErrorParams): ErrType<string> {
  const atFunction = params.atFunction ?? inferCallerName();
  const logger = resolveLogger(params.logger);
  const logId = logger.error({
    atFunction,
    message: params.message,
    data: params.data,
  });
  return Err(`[${logId}] ${params.message}`);
}
