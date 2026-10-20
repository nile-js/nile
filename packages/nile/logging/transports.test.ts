import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { closeLoggers, flushLoggers, writeLogRecord } from "./transports";

it("waits for a fresh asynchronous destination before completing flush", async () => {
  const directory = mkdtempSync(join(tmpdir(), "nile-writer-"));
  const path = join(directory, "new-file.log");
  const appName = crypto.randomUUID();
  // Exercise the production writer directly; createLog uses a synchronous branch in tests.
  writeLogRecord(path, {
    appName,
    log_id: "log-one",
    requestId: "request-one",
    atFunction: "orders.create",
    message: "Recorded",
    level: "info",
    time: new Date().toISOString(),
    data: null,
  });
  await flushLoggers(appName);
  expect(JSON.parse(readFileSync(path, "utf8")).requestId).toBe("request-one");
  await closeLoggers(appName);
});
