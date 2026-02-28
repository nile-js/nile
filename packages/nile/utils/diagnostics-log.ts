import type { NileLogger } from "@/nile/types";

type AnyLogger = NileLogger | { info: (msg: string, data?: unknown) => void };

function isNileLogger(logger: AnyLogger): logger is NileLogger {
  return "warn" in logger && "error" in logger;
}

interface CreateDiagnosticsLogParams {
  diagnostics?: boolean;
  logger?: AnyLogger;
}

/**
 * Creates a centralized diagnostics log function for nile internals.
 * Checks resources.logger first, falls back to console.log, respects diagnostics flag.
 * Returns a bound function with the prefix already applied for clean call sites.
 *
 * @param prefix - Component identifier e.g. "NileServer", "REST", "Engine"
 * @param params - Diagnostics flag and optional structured logger from resources
 * @returns A log function: (message, data?) => void
 */
export function createDiagnosticsLog(
  prefix: string,
  params: CreateDiagnosticsLogParams
): (message: string, data?: unknown) => void {
  if (!params.diagnostics) {
    // biome-ignore lint/suspicious/noEmptyBlockStatements: intentional no-op when diagnostics disabled
    return () => {};
  }

  const { logger } = params;

  return (message: string, data?: unknown) => {
    if (!logger) {
      console.log(`[${prefix}] ${message}`, data ?? "");
      return;
    }

    if (isNileLogger(logger)) {
      logger.info({
        atFunction: prefix,
        message: `[${prefix}] ${message}`,
        data,
      });
    } else {
      logger.info(`[${prefix}] ${message}`, data);
    }
  };
}
