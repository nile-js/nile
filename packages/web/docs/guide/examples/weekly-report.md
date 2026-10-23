---
title: "Weekly report"
description: "Build a weekly report from the tasks table with a cron job, hand delivery to a queue and run the job on demand"
---

This example schedules a report for Monday at 09:00 in Africa/Kampala. The job counts the tasks in the starter's table, builds a report and passes it to a queue. The queue writes the report to an `outbox` folder, which stands in for email. You will also run the job on demand, which is how you test a schedule before it fires.

## What you need

- The starter project from the [examples overview](/guide/examples), installed with `bun install`.
- Stop `bun run dev` before running the on-demand script. Both start a server on port 8000.

## 1. Add the logger module

Create `src/observability.ts`. The schedule and the queue share this logger:

```ts
import { createLogger } from "@nilejs/nile";

export const logger = createLogger("my-app", {
  mode: "dev",
  chunking: "monthly",
});
```

## 2. Write the job and the queue

Create `src/reports/weekly-report.ts`. It has four parts: the report builder, a queue with one worker, the job that connects them, and the schedule that runs the job every Monday:

```ts
import { type JobRunContext, type JobRunEvent, type SchedulerOptions, utils } from "@nilejs/nile";
import { Err, Ok, type Result } from "slang-ts";
import { taskModel } from "@/db/models";
import { logger } from "@/observability";

export interface WeeklyReport {
  name: string;
  generatedAt: string;
  totalTasks: number;
  pendingTasks: number;
  doneTasks: number;
}

export interface DeliveryResult {
  path: string;
}

const OUTBOX_DIRECTORY = "outbox";

/** Writes the report to the outbox folder. Replace this with an email or storage call. */
const deliverReport = async (
  report: WeeklyReport,
  signal: AbortSignal
): Promise<Result<DeliveryResult, string>> => {
  if (signal.aborted) {
    return Err("Delivery was cancelled");
  }

  const path = `${OUTBOX_DIRECTORY}/${report.name}.json`;
  await Bun.write(path, JSON.stringify(report, null, 2));
  return Ok({ path: path });
};

/** One delivery at a time keeps the outbox writes in order. */
export const reportQueue = utils.createQueue<WeeklyReport, DeliveryResult>({
  task: deliverReport,
  concurrency: 1,
  capacity: 100,
});

const buildWeeklyReport = async (generatedAt: Date): Promise<Result<WeeklyReport, string>> => {
  const tasks = await taskModel.findAll();
  if (tasks.isErr) {
    return Err(tasks.error);
  }

  const rows = tasks.value;
  const doneTasks = rows.filter((task) => task.status === "done").length;
  const pendingTasks = rows.filter((task) => task.status === "pending").length;

  return Ok({
    name: `weekly-${generatedAt.toISOString().slice(0, 10)}`,
    generatedAt: generatedAt.toISOString(),
    totalTasks: rows.length,
    pendingTasks: pendingTasks,
    doneTasks: doneTasks,
  });
};

/** Scheduled job: build the report, then hand delivery to the queue. */
export const weeklyReportJob = async (
  run: JobRunContext
): Promise<Result<{ report: string; path: string }, string>> => {
  const built = await buildWeeklyReport(run.scheduledAt);
  if (built.isErr) {
    return Err(built.error);
  }

  const delivered = await reportQueue.run(built.value, { signal: run.signal });
  if (delivered.isErr) {
    return Err(delivered.error);
  }

  return Ok({ report: built.value.name, path: delivered.value.path });
};

export const recordRunEvent = (event: JobRunEvent): void => {
  logger.info({
    atFunction: "scheduler",
    message: `Job ${event.job} ${event.phase}`,
    data: { runId: event.runId, durationMs: event.durationMs ?? null },
  });
};

export const schedules: SchedulerOptions = {
  jobs: [
    {
      name: "weekly-report",
      schedule: {
        weekly: "monday",
        at: "09:00",
        timezone: "Africa/Kampala",
      },
      handler: weeklyReportJob,
    },
  ],
  onRunEvent: recordRunEvent,
};
```

`reportQueue` allows one delivery at a time and holds up to 100 waiting reports. The job returns the Result of the delivery, so a failed write appears as a failed run.

## 3. Register the schedule

Replace `src/index.ts`. The only change from the starter is the `schedules` option and the shared logger:

```ts
import { createNileServer } from "@nilejs/nile";
import { sql } from "drizzle-orm";
import { Ok, safeTry } from "slang-ts";
import { db } from "@/db/client";
import { schedules } from "@/reports/weekly-report";
import { logger } from "@/observability";
import { services } from "@/services/services.config";

/** Push schema to PGLite on boot */
const pushSchema = async () => {
  const result = await safeTry(() =>
    db.execute(sql`
      CREATE TABLE IF NOT EXISTS tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)
  );

  if (result.isErr) {
    console.error("[pushSchema] Failed:", result.error);
  }
};

export const server = await createNileServer({
  serverName: "my-app",
  runtime: "bun",
  native: true,
  project: { structure: "error" },
  services,
  resources: { logger, database: db },
  schedules: schedules,
  rest: {
    baseUrl: "/api",
    host: "localhost",
    port: 8000,
    allowedOrigins: ["http://localhost:8000"],
    enableStatus: true,
  },
  onBoot: {
    // The first PGlite start on a slow machine can take longer than the 10 second default.
    maxWaitTime: 30_000,
    fn: async (ctx) => {
      await pushSchema();
      ctx.resources?.logger?.info({
        atFunction: "onBoot",
        message: "my-app booted - PGLite schema ready",
      });
      return Ok(null);
    },
  },
});

if (server.nativeRest) {
  const port = server.config.rest?.port ?? 8000;
  Bun.serve({ port, fetch: server.nativeRest.fetch });
  console.log(`\nmy-app listening on http://localhost:${port}\n`);
}
```

## 4. Add the on-demand script

Create `scripts/run-weekly-report.ts`. It starts the server, prints the schedule state, runs the job now and shuts down:

```ts
import { server } from "../src/index";

console.log("jobs:", JSON.stringify(server.scheduler?.inspect()));

const outcome = await server.scheduler?.runNow("weekly-report");
if (outcome === undefined) {
  throw new Error("Scheduler is not running");
}
console.log("runNow:", outcome.isErr ? `error: ${outcome.error}` : JSON.stringify(outcome.value));

await server.lifecycle.shutdown({ timeoutMs: 5000 });
process.exit(0);
```

## 5. Run the job now

```sh
bun run scripts/run-weekly-report.ts
```

The server starts first and prints its usual startup lines. Then the script prints the schedule and the run. The lines that matter look like this:

```text
jobs: [{"name":"weekly-report","running":true,"active":false,"nextRun":"2026-10-26T06:00:00.000Z"}]
22:31:21.350 INFO  scheduler Job weekly-report started {
  runId: "1d947f73-b935-47ac-9c77-fa29c549d650",
  durationMs: null,
}
22:31:21.367 INFO  scheduler Job weekly-report completed {
  runId: "1d947f73-b935-47ac-9c77-fa29c549d650",
  durationMs: 17.6066330000001,
}
runNow: {"report":"weekly-2026-10-22","path":"outbox/weekly-2026-10-22.json"}
```

`nextRun` is the next Monday at 09:00 in Africa/Kampala, which is 06:00 UTC. The date changes each week. The `report` name uses the scheduled date, so a run on 22 October is named `weekly-2026-10-22`.

Check the file the queue wrote:

```sh
cat outbox/weekly-*.json
```

You should see the report fields:

```json
{
  "name": "weekly-2026-10-22",
  "generatedAt": "2026-10-22T22:31:21.349Z",
  "totalTasks": 1,
  "pendingTasks": 1,
  "doneTasks": 0
}
```

The counts depend on the tasks in your database. The script creates the `outbox` folder when it writes the first report.

## 6. Let the schedule run

Start the server and leave it running:

```sh
bun run dev
```

Nile Js starts the schedule when the server boots. The job runs at its next time, and the scheduler skips a run if the previous one is still active. Check the next time at any point by calling `server.scheduler.inspect()` from code, as the script does.

## 7. Type-check

```sh
./node_modules/.bin/tsc --noEmit
```

You should see no output and exit with status 0.

## Limits in this example

- The schedule runs in every process that has it enabled. Running two replicas produces two reports, so keep this server to one process, or move the schedule to a separate scheduler process.
- A missed run is not replayed after a restart.
- The queue lives in memory. A report waiting in the queue is lost if the process stops before it writes the file.

## Troubleshooting

- **`Port 8000 is in use` or `EADDRINUSE`.** Stop `bun run dev` before you run the script.
- **`Scheduler is not running`.** The script could not find the scheduler. Check that `src/index.ts` passes `schedules` to `createNileServer`.
- **The file is missing from `outbox`.** Look for a `failed` event in the server output. The job returns the failure from the queue.

## See also

- [Cron jobs](/guide/features/cron-jobs) explains every schedule form and the recorder.
- [Queues, debounce and throttle](/guide/features/queues-debounce-throttle) explains concurrency and capacity.
- [Production operations](/guide/reference/operations) covers scheduler lifecycle and replicas.
