import { type Log, type LoggerConfig, createLog as newLog } from "./logger";
import { closeLoggers, flushLoggers } from "./transports";

type LogInput = Omit<Log, "appName">;

/**
 * Creates a logger instance bound to a specific app name.
 * Optionally accepts a LoggerConfig for time-based file chunking.
 * @param appName - The application name (determines log file/directory)
 * @param config - Config for chunking and mode
 */
export const createLogger = (
  appName: string,
  config: LoggerConfig
): {
  flush: () => Promise<void>;
  close: () => Promise<void>;
  info: (input: LogInput) => string;
  warn: (input: LogInput) => string;
  error: (input: LogInput) => string;
} => {
  return {
    flush: () => flushLoggers(appName),
    close: () => closeLoggers(appName),
    info: (input: LogInput) =>
      newLog({ ...input, appName, level: "info" }, config),
    warn: (input: LogInput) =>
      newLog({ ...input, appName, level: "warn" }, config),
    error: (input: LogInput) =>
      newLog({ ...input, appName, level: "error" }, config),
  };
};
