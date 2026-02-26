/** Minimal interface for a logger that nile internals can use */
interface DiagnosticsLogger {
  info: (msg: string, data?: unknown) => void;
}

interface CreateDiagnosticsLogParams {
  diagnostics?: boolean;
  logger?: DiagnosticsLogger;
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
    if (logger?.info) {
      logger.info(`[${prefix}] ${message}`, data);
    } else {
      console.log(`[${prefix}] ${message}`, data ?? "");
    }
  };
}
