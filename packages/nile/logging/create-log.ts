import { type Log, type LoggerConfig, createLog as newLog } from "./logger";

type LogInput = Omit<Log, "appName">;

/**
 * Creates a logger instance bound to a specific app name.
 * Optionally accepts a LoggerConfig for time-based file chunking.
 * @param appName - The application name (determines log file/directory)
 * @param config - Optional config for chunking (monthly, daily, weekly)
 */
export const createLogger = (appName: string, config?: LoggerConfig) => {
  return {
    info: (input: LogInput) =>
      newLog({ ...input, appName, level: "info" }, config),
    warn: (input: LogInput) =>
      newLog({ ...input, appName, level: "warn" }, config),
    error: (input: LogInput) =>
      newLog({ ...input, appName, level: "error" }, config),
  };
};
