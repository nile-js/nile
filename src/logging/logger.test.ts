import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { LoggerConfig } from "./index";
import {
  createLog,
  createLogger,
  formatChunkName,
  getLogs,
  resolveLogPath,
} from "./index";

const logDir = join(process.cwd(), "logs");
const testAppName = "test-app";
const logFile = join(logDir, `${testAppName}.log`);

// Regex patterns hoisted to module scope per lint rules
const WEEKLY_CHUNK_PATTERN = /\d{4}-W\d{2}\.log$/;
const WEEKLY_NAME_PATTERN = /^2026-W\d{2}$/;

// Chunked test app name to avoid collision with flat tests
const chunkedApp = "test-chunked";
const chunkedAppDir = join(logDir, chunkedApp);

beforeAll(() => {
  // Clean flat log file
  if (existsSync(logFile)) {
    rmSync(logFile);
  }
  // Clean chunked app directory
  if (existsSync(chunkedAppDir)) {
    rmSync(chunkedAppDir, { recursive: true });
  }
  if (!existsSync(logDir)) {
    mkdirSync(logDir);
  }
});

afterAll(() => {
  // Clean up chunked test files
  if (existsSync(chunkedAppDir)) {
    rmSync(chunkedAppDir, { recursive: true });
  }
});

// --- Backwards compatibility: flat file mode (chunking: 'none' or omitted) ---

describe("Logger - createLog (flat mode)", () => {
  it("should write a log entry to file", () => {
    const log_id = createLog({
      appName: testAppName,
      atFunction: "testFunction",
      message: "This is a test log",
      data: { example: true },
      level: "info",
    });

    expect(typeof log_id).toBe("string");
    expect(log_id.length).toBeGreaterThan(0);
    expect(existsSync(logFile)).toBe(true);

    const content = readFileSync(logFile, "utf-8");
    const lines = content.trim().split("\n");
    const lastLine = lines.at(-1) ?? "";
    const last = JSON.parse(lastLine);

    expect(last.message).toBe("This is a test log");
    expect(last.level).toBe("info");
    expect(last.data.example).toBe(true);
  });
});

describe("Logger - createLogger instance (flat mode)", () => {
  it("should write an info log using instance", () => {
    const logger = createLogger(testAppName);
    const log_id = logger.info({
      atFunction: "instanceFunction",
      message: "Logged from instance",
      data: { test: 123 },
    });

    expect(typeof log_id).toBe("string");

    const content = readFileSync(logFile, "utf-8");
    const lines = content.trim().split("\n");
    const lastLine = lines.at(-1) ?? "";
    const last = JSON.parse(lastLine);

    expect(last.atFunction).toBe("instanceFunction");
    expect(last.level).toBe("info");
    expect(last.data.test).toBe(123);
  });
});

// --- resolveLogPath ---

describe("resolveLogPath", () => {
  it("should return flat file path when chunking is 'none'", () => {
    const path = resolveLogPath("myApp");
    expect(path).toBe(join(logDir, "myApp.log"));
  });

  it("should return flat file path when no config provided", () => {
    const path = resolveLogPath("myApp", undefined);
    expect(path).toBe(join(logDir, "myApp.log"));
  });

  it("should return directory-based path for monthly chunking", () => {
    const path = resolveLogPath(chunkedApp, { chunking: "monthly" });
    const now = new Date();
    const expected = join(
      logDir,
      chunkedApp,
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}.log`
    );
    expect(path).toBe(expected);
    expect(existsSync(join(logDir, chunkedApp))).toBe(true);
  });

  it("should return directory-based path for daily chunking", () => {
    const path = resolveLogPath(chunkedApp, { chunking: "daily" });
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const expected = join(
      logDir,
      chunkedApp,
      `${now.getFullYear()}-${month}-${day}.log`
    );
    expect(path).toBe(expected);
  });

  it("should return directory-based path for weekly chunking", () => {
    const path = resolveLogPath(chunkedApp, { chunking: "weekly" });
    // Just verify it's under the app directory and matches YYYY-WNN.log pattern
    expect(path.startsWith(join(logDir, chunkedApp))).toBe(true);
    expect(path).toMatch(WEEKLY_CHUNK_PATTERN);
  });
});

// --- formatChunkName ---

describe("formatChunkName", () => {
  it("should format monthly chunk name", () => {
    const date = new Date(2026, 1, 15); // Feb 15, 2026
    expect(formatChunkName(date, "monthly")).toBe("2026-02");
  });

  it("should format daily chunk name", () => {
    const date = new Date(2026, 1, 5); // Feb 5, 2026
    expect(formatChunkName(date, "daily")).toBe("2026-02-05");
  });

  it("should format weekly chunk name", () => {
    // Jan 5, 2026 is a Monday — ISO week 2
    const date = new Date(2026, 0, 5);
    const result = formatChunkName(date, "weekly");
    expect(result).toMatch(WEEKLY_NAME_PATTERN);
  });

  it("should pad single-digit months", () => {
    const date = new Date(2026, 0, 1); // Jan 1
    expect(formatChunkName(date, "monthly")).toBe("2026-01");
  });
});

// --- Chunked file writing ---

describe("Logger - createLog (chunked mode)", () => {
  const monthlyConfig: LoggerConfig = { chunking: "monthly" };

  it("should write log to chunked directory with monthly config", () => {
    const log_id = createLog(
      {
        appName: chunkedApp,
        atFunction: "chunkedTest",
        message: "Monthly chunked log",
        data: { chunked: true },
        level: "info",
      },
      monthlyConfig
    );

    expect(typeof log_id).toBe("string");
    expect(log_id.length).toBeGreaterThan(0);

    // Verify file exists in app subdirectory
    const expectedPath = resolveLogPath(chunkedApp, monthlyConfig);
    expect(existsSync(expectedPath)).toBe(true);

    const content = readFileSync(expectedPath, "utf-8");
    const lines = content.trim().split("\n");
    const last = JSON.parse(lines.at(-1) ?? "");

    expect(last.message).toBe("Monthly chunked log");
    expect(last.appName).toBe(chunkedApp);
    expect(last.data.chunked).toBe(true);
  });

  it("should write multiple logs to same chunk file", () => {
    const dailyConfig: LoggerConfig = { chunking: "daily" };

    createLog(
      {
        appName: chunkedApp,
        atFunction: "dailyTest1",
        message: "First daily log",
        level: "info",
      },
      dailyConfig
    );
    createLog(
      {
        appName: chunkedApp,
        atFunction: "dailyTest2",
        message: "Second daily log",
        level: "warn",
      },
      dailyConfig
    );

    const logPath = resolveLogPath(chunkedApp, dailyConfig);
    const content = readFileSync(logPath, "utf-8");
    const lines = content.trim().split("\n");

    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0] ?? "").message).toBe("First daily log");
    expect(JSON.parse(lines[1] ?? "").message).toBe("Second daily log");
  });
});

// --- createLogger with chunking ---

describe("Logger - createLogger instance (chunked mode)", () => {
  it("should accept config and write to chunked files", () => {
    const logger = createLogger(chunkedApp, { chunking: "weekly" });

    const log_id = logger.error({
      atFunction: "weeklyLogger",
      message: "Weekly error log",
      data: { severity: "high" },
    });

    expect(typeof log_id).toBe("string");

    const logPath = resolveLogPath(chunkedApp, { chunking: "weekly" });
    const content = readFileSync(logPath, "utf-8");
    const lines = content.trim().split("\n");
    const last = JSON.parse(lines.at(-1) ?? "");

    expect(last.atFunction).toBe("weeklyLogger");
    expect(last.level).toBe("error");
    expect(last.message).toBe("Weekly error log");
  });
});

// --- getLogs with chunking ---

describe("getLogs (chunked mode)", () => {
  const monthlyConfig: LoggerConfig = { chunking: "monthly" };

  it("should retrieve logs from chunked files", () => {
    const logs = getLogs({ appName: chunkedApp }, monthlyConfig);
    expect(logs.length).toBeGreaterThan(0);

    const monthlyLog = logs.find((l) => l.message === "Monthly chunked log");
    expect(monthlyLog).toBeDefined();
  });

  it("should return empty array for non-existent app in chunked mode", () => {
    const logs = getLogs(
      { appName: "non-existent-app" },
      { chunking: "monthly" }
    );
    expect(logs).toEqual([]);
  });

  it("should return empty array when no appName in chunked mode", () => {
    const logs = getLogs({}, { chunking: "monthly" });
    expect(logs).toEqual([]);
  });

  it("should filter logs by level in chunked mode", () => {
    const logs = getLogs({ appName: chunkedApp, level: "warn" }, monthlyConfig);
    // All returned logs should be warn level
    for (const log of logs) {
      expect(log.level).toBe("warn");
    }
  });
});

// --- getLogs flat mode (backwards compatibility) ---

describe("getLogs (flat mode)", () => {
  it("should still work with no config (backwards compatible)", () => {
    const logs = getLogs({ appName: testAppName });
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0]?.appName).toBe(testAppName);
  });

  it("should filter by log_id", () => {
    const log_id = createLog({
      appName: testAppName,
      atFunction: "filterTest",
      message: "Findable log",
      level: "info",
    });

    const logs = getLogs({ appName: testAppName, log_id });
    expect(logs.length).toBe(1);
    expect(logs[0]?.message).toBe("Findable log");
  });
});
