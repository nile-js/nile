import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { createLog, createLogger } from "./index";

const logDir = join(process.cwd(), "logs");
const testAppName = "test-app";
const logFile = join(logDir, `${testAppName}.log`);

beforeAll(() => {
  // Clean logs dir before test
  if (existsSync(logFile)) {
    rmSync(logFile);
  }
  if (!existsSync(logDir)) {
    mkdirSync(logDir);
  }
});

describe("Logger - createLog", () => {
  it("should write a log entry to file", () => {
    const log_id = createLog({
      appName: testAppName,
      atFunction: "testFunction",
      message: "This is a test log",
      data: { example: true },
      type: "info",
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

describe("Logger - createLogger instance", () => {
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
