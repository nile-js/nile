const ACTION_ERROR_PATTERN =
  /^Error Code: [A-Za-z0-9_-]{12} - could not complete the action$/;

import { mkdtemp, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Err, Ok } from "slang-ts";
import { describe, expect, it, vi } from "vitest";
import { createBatch } from "../../controls/batch";
import { createDebounce } from "../../controls/debounce";
import { createQueue } from "../../controls/queue";
import { createThrottle } from "../../controls/throttle";
import { guardOperation } from "../../diagnostics/guard-operation";
import { createEngine } from "../../engine/engine";
import { createNileServer } from "../../nile/server";
import { enforceProjectStructure } from "../../project/check-structure";
import { createScheduler } from "../../scheduling/scheduler";

const SECRET = "PRIVATE_DRIVER_SENTINEL";
const panic = () => Reflect.apply(Ok, undefined, [Ok(1)]);

describe("release exception boundaries", () => {
  it("contains throws and panics even when the diagnostic logger fails", async () => {
    const write = vi.fn(() => {
      throw new Error(SECRET);
    });
    const logger = { error: write, info: write, warn: write };
    const thrown = await guardOperation(
      () => {
        throw new Error(SECRET);
      },
      { logger }
    );
    expect(thrown.isErr && thrown.error).toMatch(ACTION_ERROR_PATTERN);
    expect(write).toHaveBeenCalled();
    expect(JSON.stringify(write.mock.calls)).not.toContain(SECRET);
    expect((await guardOperation(panic)).isErr).toBe(true);
    expect((await guardOperation(() => Err("Choose another name"))).error).toBe(
      "Choose another name"
    );
  });

  it("releases queue slots and settles callers after a task panic", async () => {
    let first = true;
    const queue = createQueue({
      task: () => {
        if (first) {
          first = false;
          return panic();
        }
        return Ok(42);
      },
      concurrency: 1,
    });
    const failed = queue.run(0);
    const next = queue.run(1);
    expect((await failed).isErr).toBe(true);
    expect((await next).expect()).toBe(42);
    await queue.drain();
    queue.close();
  });

  it("settles timed controls, batches and schedules after panics", async () => {
    const controls = [
      createDebounce({ task: panic, waitMs: 1 }),
      createThrottle({ task: panic, waitMs: 1 }),
      createBatch({ task: panic, size: 1, waitMs: 1 }),
    ];
    for (const control of controls) {
      expect((await control.run(0)).isErr).toBe(true);
      await control.drain();
      control.close();
    }
    const scheduler = createScheduler({
      jobs: [{ name: "panic", schedule: { every: "1h" }, handler: panic }],
    });
    expect((await scheduler.runNow("panic")).isErr).toBe(true);
    expect((await scheduler.runNow("panic")).isErr).toBe(true);
    expect(scheduler.inspect()[0]?.running).toBe(false);
    scheduler.stop();
    await scheduler.drain();
  });

  it("sanitizes public failures, logs bounded causes and drains after a panic", async () => {
    const write = vi.fn(() => "audit-log");
    const app = await createNileServer({
      serverName: "Boundary regression",
      forceNewInstance: true,
      logServices: false,
      runtime: "bun",
      native: true,
      project: { structure: false },
      resources: { logger: { error: write, info: write, warn: write } },
      services: [
        {
          name: "checks",
          description: "Checks",
          actions: [
            {
              name: "throw",
              description: "Throw",
              handler: () => {
                throw Object.assign(new Error(SECRET), { code: "23505" });
              },
            },
            { name: "panic", description: "Panic", handler: panic },
            {
              name: "refuse",
              description: "Refuse",
              handler: () => Err("Choose another name"),
            },
          ],
        },
      ],
      rest: { baseUrl: "/api", allowedOrigins: [] },
    });
    const rest = app.nativeRest;
    if (!rest) {
      throw new Error("Expected native adapter");
    }
    try {
      for (const action of ["throw", "panic", "refuse"]) {
        const response = await rest.fetch(
          new Request("http://localhost/api/services", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              intent: "execute",
              service: "checks",
              action,
              payload: {},
            }),
          })
        );
        const body = await response.json();
        if (action === "refuse") {
          expect(body.message).toBe("Choose another name");
        } else {
          expect(body.message).toMatch(ACTION_ERROR_PATTERN);
        }
        expect(app.lifecycle.active()).toBe(0);
      }
      expect(JSON.stringify(write.mock.calls)).toContain("23505");
      expect(JSON.stringify(write.mock.calls)).not.toContain(SECRET);
    } finally {
      const report = await app.lifecycle.shutdown({ timeoutMs: 100 });
      expect(report.remainingExecutions).toBe(0);
      expect(report.timedOut).toBe(false);
    }
  });

  it("never treats inherited properties as registered services or actions", () => {
    const engine = createEngine({
      services: [{ name: "real", description: "Real", actions: [] }],
    });
    for (const name of ["constructor", "toString", "__proto__"]) {
      expect(engine.getAction("real", name).isErr).toBe(true);
      expect(engine.getServiceActions(name).isErr).toBe(true);
      expect(engine.getAction(name, "constructor").isErr).toBe(true);
    }
  });

  it("rejects explicit source symlinks and files in strict mode", async () => {
    const root = await mkdtemp("/tmp/nile-strict-symlink-");
    const target = await mkdtemp("/tmp/nile-source-target-");
    await symlink(target, join(root, "src"));
    await expect(enforceProjectStructure({ root })).rejects.toThrow(
      "real directory"
    );
    const fileRoot = await mkdtemp("/tmp/nile-strict-file-");
    await writeFile(join(fileRoot, "src"), "not a directory");
    await expect(enforceProjectStructure({ root: fileRoot })).rejects.toThrow(
      "real directory"
    );
  });
});
