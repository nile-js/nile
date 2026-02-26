import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { nanoid } from "nanoid";
import pino, { type Logger } from "pino";

export interface Log {
  atFunction: string;
  appName: string;
  message: string;
  data?: unknown;
  level?: "info" | "warn" | "error";
  log_id?: string;
}

/** Configuration for log file chunking behavior */
export interface LoggerConfig {
  /** Time-based chunking strategy. Default: 'none' (single file per app) */
  chunking?: "monthly" | "daily" | "weekly" | "none";
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

// Chunk filename patterns — hoisted for performance (used in hot path by getLogs)
const MONTHLY_PATTERN = /^(\d{4})-(\d{2})$/;
const DAILY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const WEEKLY_PATTERN = /^(\d{4})-W(\d{2})$/;

/**
 * Resolves the correct log file path based on app name and chunking config.
 * - 'none' (default): logs/{appName}.log (backwards compatible)
 * - 'monthly': logs/{appName}/YYYY-MM.log
 * - 'daily': logs/{appName}/YYYY-MM-DD.log
 * - 'weekly': logs/{appName}/YYYY-WNN.log (ISO week number)
 */
export function resolveLogPath(appName: string, config?: LoggerConfig): string {
  const chunking = config?.chunking ?? "none";

  if (chunking === "none") {
    return join(logDir, `${appName}.log`);
  }

  const appDir = join(logDir, appName);
  if (!existsSync(appDir)) {
    mkdirSync(appDir, { recursive: true });
  }

  const now = new Date();
  const chunk = formatChunkName(now, chunking);
  return join(appDir, `${chunk}.log`);
}

/**
 * Formats a date into the correct chunk filename based on chunking strategy.
 * Exported for testing and reuse by getLogs.
 */
export function formatChunkName(
  date: Date,
  chunking: "monthly" | "daily" | "weekly"
): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");

  if (chunking === "monthly") {
    return `${year}-${month}`;
  }

  if (chunking === "daily") {
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  // Weekly: ISO week number
  const weekNum = getISOWeekNumber(date);
  return `${year}-W${String(weekNum).padStart(2, "0")}`;
}

/** Returns the ISO 8601 week number for a given date */
function getISOWeekNumber(date: Date): number {
  const target = new Date(date.valueOf());
  // Set to nearest Thursday (current date + 4 - current day number, with Sunday as 7)
  const dayNum = target.getDay() || 7;
  target.setDate(target.getDate() + 4 - dayNum);
  const yearStart = new Date(target.getFullYear(), 0, 1);
  return Math.ceil(
    ((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7
  );
}

/**
 * Creates a pino logger instance that writes to the resolved log file path.
 * Each call creates a fresh pino transport — callers should cache if needed.
 */
function createLoggerForApp(appName: string, config?: LoggerConfig): Logger {
  const logFile = resolveLogPath(appName, config);

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
}

/**
 * Creates a new log entry with the provided log information.
 * Supports optional chunking config to split logs into time-based files.
 * @param log - The log object containing the log details
 * @param config - Optional logger config for chunking behavior
 * @returns The generated log ID (or JSON string in agentic mode)
 * @throws {Error} If appName is missing in the log object
 */
export const createLog = (log: Log, config?: LoggerConfig) => {
  if (!log.appName) {
    throw new Error(`Missing appName in log: ${JSON.stringify(log)}`);
  }

  const level = log.level || "info";
  const log_id = log.log_id || nanoid(6);

  const logRecord = {
    log_id,
    appName: log.appName,
    atFunction: log.atFunction,
    message: log.message,
    data: log.data ?? null,
    level,
    time: new Date().toISOString(),
  };

  const mode = getMode();

  if (mode === "prod" || process.env.NODE_ENV === "test") {
    const logFile = resolveLogPath(log.appName, config);

    if (process.env.NODE_ENV === "test") {
      // For tests, write synchronously to ensure file exists immediately
      appendFileSync(logFile, `${JSON.stringify(logRecord)}\n`, "utf-8");
    } else {
      // For production, use pino logger
      const appLogger = createLoggerForApp(log.appName, config);
      appLogger[level as "info" | "warn" | "error"](logRecord);
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
  level?: "info" | "warn" | "error";
  from?: Date;
  to?: Date;
}

/**
 * Retrieves logs based on the provided filters.
 * Supports reading from chunked files when a LoggerConfig with chunking is provided.
 * When chunking is enabled, uses from/to date filters to intelligently select
 * only the relevant chunk files instead of scanning all files.
 * @param filters - Optional filters to apply when retrieving logs
 * @param config - Optional logger config matching the chunking used when writing
 * @returns An array of log entries matching the filters
 */
export const getLogs = (
  filters: LogFilter = {},
  config?: LoggerConfig
): Log[] => {
  const chunking = config?.chunking ?? "none";

  const filesToRead = resolveLogFiles(filters, chunking);
  const logs = readAndParseLogFiles(filesToRead);
  return applyLogFilters(logs, filters);
};

/**
 * Determines which log files to read based on filters and chunking strategy.
 * For 'none' chunking, returns the single flat file.
 * For time-based chunking, scans the app directory and filters by date range.
 */
function resolveLogFiles(
  filters: LogFilter,
  chunking: "monthly" | "daily" | "weekly" | "none"
): string[] {
  if (chunking === "none") {
    const logFile = filters.appName
      ? join(logDir, `${filters.appName}.log`)
      : join(logDir, "app.log");
    return existsSync(logFile) ? [logFile] : [];
  }

  // Chunked mode requires appName to locate the directory
  if (!filters.appName) {
    return [];
  }

  const appDir = join(logDir, filters.appName);
  if (!existsSync(appDir)) {
    return [];
  }

  const allFiles = readdirSync(appDir)
    .filter((f) => f.endsWith(".log"))
    .sort();

  // If no date filters, read all chunk files
  if (!(filters.from || filters.to)) {
    return allFiles.map((f) => join(appDir, f));
  }

  // Filter chunks by date relevance to avoid reading unnecessary files
  return allFiles
    .filter((filename) => isChunkRelevant(filename, chunking, filters))
    .map((f) => join(appDir, f));
}

/**
 * Checks if a chunk file is relevant to the given date range filter.
 * Compares the chunk's time range against the filter's from/to dates.
 */
function isChunkRelevant(
  filename: string,
  chunking: "monthly" | "daily" | "weekly",
  filters: LogFilter
): boolean {
  // Extract the chunk name (strip .log extension)
  const chunkName = filename.replace(".log", "");
  const range = getChunkDateRange(chunkName, chunking);

  if (!range) {
    return true; // Can't parse — include to be safe
  }

  const { start, end } = range;

  // Chunk is relevant if its range overlaps with the filter range
  if (filters.to && start > filters.to) {
    return false;
  }
  if (filters.from && end < filters.from) {
    return false;
  }

  return true;
}

/**
 * Returns the start and end date boundaries of a chunk based on its name and strategy.
 * This allows getLogs to skip chunks that fall outside the requested date range.
 */
function getChunkDateRange(
  chunkName: string,
  chunking: "monthly" | "daily" | "weekly"
): { start: Date; end: Date } | null {
  if (chunking === "monthly") {
    // Format: YYYY-MM
    const match = chunkName.match(MONTHLY_PATTERN);
    if (!(match?.[1] && match[2])) {
      return null;
    }
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
    return { start, end };
  }

  if (chunking === "daily") {
    // Format: YYYY-MM-DD
    const match = chunkName.match(DAILY_PATTERN);
    if (!(match?.[1] && match[2] && match[3])) {
      return null;
    }
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    const start = new Date(year, month, day);
    const end = new Date(year, month, day, 23, 59, 59, 999);
    return { start, end };
  }

  // Weekly: YYYY-WNN
  const match = chunkName.match(WEEKLY_PATTERN);
  if (!(match?.[1] && match[2])) {
    return null;
  }
  const year = Number(match[1]);
  const week = Number(match[2]);
  const start = getDateFromISOWeek(year, week);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/** Returns the Monday date for a given ISO year and week number */
function getDateFromISOWeek(year: number, week: number): Date {
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  // Monday of week 1
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - dayOfWeek + 1);
  // Add (week - 1) weeks
  monday.setDate(monday.getDate() + (week - 1) * 7);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

/** Reads and parses NDJSON log entries from multiple files into a single array */
function readAndParseLogFiles(files: string[]): Record<string, unknown>[] {
  const logs: Record<string, unknown>[] = [];

  for (const file of files) {
    if (!existsSync(file)) {
      continue;
    }

    const content = readFileSync(file, "utf-8").trim();
    if (!content) {
      continue;
    }

    const lines = content.split("\n");
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        logs.push(parsed);
      } catch {
        // Skip malformed lines
      }
    }
  }

  return logs;
}

/** Applies log_id, level, and time range filters to parsed log entries */
function applyLogFilters(
  logs: Record<string, unknown>[],
  filters: LogFilter
): Log[] {
  return logs.filter((log) => {
    if (filters.appName && log.appName !== filters.appName) {
      return false;
    }
    if (filters.log_id && log.log_id !== filters.log_id) {
      return false;
    }
    if (filters.level && log.level !== filters.level) {
      return false;
    }

    const time = new Date(log.time as string);
    if (filters.from && time < filters.from) {
      return false;
    }
    if (filters.to && time > filters.to) {
      return false;
    }

    return true;
  }) as unknown as Log[];
}
