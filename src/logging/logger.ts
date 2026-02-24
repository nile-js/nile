import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { nanoid } from "nanoid";
import pino, { type Logger } from "pino";

export interface Log {
  atFunction: string;
  appName: string;
  message: string;
  data?: unknown;
  type?: "info" | "warn" | "error";
  log_id?: string;
}

// Lazy evaluation of MODE - only check when logging is actually used
const getMode = () => {
  if (!process.env.MODE) {
    throw new Error("Missing MODE environment variable");
  }
  return process.env.MODE;
};

const logDir = join(process.cwd(), "logs");

if (!existsSync(logDir)) {
  mkdirSync(logDir);
}

// Create a logger factory function that accepts appName
const createLoggerForApp = (appName: string): Logger => {
  const logFile = join(logDir, `${appName}.log`);

  const transport = pino.transport({
    targets: [
      {
        level: "info",
        target: "pino/file",
        options: {
          destination: logFile,
          mkdir: true,
        },
      },
    ],
  });

  return pino(
    {
      base: null,
      timestamp: () => `,"time":"${new Date().toISOString()}"`,
      formatters: {
        level(label) {
          return { level: label };
        },
      },
    },
    transport
  );
};

// Default logger for backwards compatibility
const defaultLogFile = join(logDir, "app.log");
const defaultTransport = pino.transport({
  targets: [
    {
      level: "info",
      target: "pino/file",
      options: {
        destination: defaultLogFile,
        mkdir: true,
      },
    },
  ],
});

const _logger: Logger = pino(
  {
    base: null,
    timestamp: () => `,"time":"${new Date().toISOString()}"`,
    formatters: {
      level(label) {
        return { level: label };
      },
    },
  },
  defaultTransport
);

/**
 * Creates a new log entry with the provided log information
 * @param {Log} log - The log object containing the log details
 * @returns {string} The generated log ID
 * @throws {Error} If appName is missing in the log object
 */
export const createLog = (log: Log) => {
  if (!log.appName) {
    throw new Error(`Missing appName in log: ${JSON.stringify(log)}`);
  }

  const type = log.type || "info";
  const log_id = log.log_id || nanoid(6);

  const logRecord = {
    log_id,
    appName: log.appName,
    atFunction: log.atFunction,
    message: log.message,
    data: log.data ?? null,
    level: type,
    time: new Date().toISOString(),
  };

  const mode = getMode();

  if (mode === "prod" || process.env.NODE_ENV === "test") {
    if (process.env.NODE_ENV === "test") {
      // For tests, write synchronously to ensure file exists immediately
      const logFile = join(logDir, `${log.appName}.log`);
      appendFileSync(logFile, `${JSON.stringify(logRecord)}\n`, "utf-8");
    } else {
      // For production, use pino logger
      const appLogger = createLoggerForApp(log.appName);
      appLogger[type as "info" | "warn" | "error"](logRecord);
    }
    return log_id;
  }
  if (mode === "agentic") {
    return JSON.stringify(logRecord);
  }
  console.log({
    ...logRecord,
    data: JSON.stringify(logRecord.data, null, 2),
  });
  return "dev-mode, see your dev console!";
};

interface LogFilter {
  appName?: string;
  log_id?: string;
  type?: "info" | "warn" | "error";
  from?: Date;
  to?: Date;
}

/**
 * Retrieves logs based on the provided filters
 * @param {LogFilter} filters - Optional filters to apply when retrieving logs
 * @returns {Log[]} An array of log entries matching the filters
 */
export const getLogs = (filters: LogFilter = {}): Log[] => {
  const logFile = filters.appName
    ? join(logDir, `${filters.appName}.log`)
    : join(logDir, "app.log");

  if (!existsSync(logFile)) {
    return [];
  }

  const content = readFileSync(logFile, "utf-8");
  const lines = content.trim().split("\n");

  const logs = lines
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .filter((log) => {
      if (filters.appName && log.appName !== filters.appName) {
        return false;
      }
      if (filters.log_id && log.log_id !== filters.log_id) {
        return false;
      }
      if (filters.type && log.level !== filters.type) {
        return false;
      }

      const time = new Date(log.time);
      if (filters.from && time < filters.from) {
        return false;
      }
      if (filters.to && time > filters.to) {
        return false;
      }

      return true;
    });

  return logs;
};
