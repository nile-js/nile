---
title: "Cron jobs"
description: "Run recurring business work on calendar, interval or one-time schedules, and trigger a job by hand for testing"
---

Scheduled jobs run business functions on a timetable without an HTTP request. Each job has a name, a schedule and a handler. Nile Js starts the schedules when the server boots and reports each run to a recorder you provide.

## When to use it

Use a schedule for work that happens on a timetable: a weekly report, a nightly cleanup or a reminder at a fixed time. Put the work in an ordinary function and let the job call it, so the same function can run from an action or a test.

## Complete example

The job builds a summary and returns a Result. The recorder receives start, completion and failure events. This file registers the schedule with the server; the [weekly report example](/guide/examples/weekly-report) adds a queue and runs the job end to end.

```ts
import {
  createNileServer,
  createServices,
  type JobRunContext,
  type JobRunEvent,
  type SchedulerOptions,
} from "@nilejs/nile";
import { Err, Ok } from "slang-ts";

type WeeklySummary = {
  orderCount: number;
  generatedAt: string;
};

const buildWeeklySummary = async (signal: AbortSignal): Promise<WeeklySummary> => {
  if (signal.aborted) {
    throw new Error("Report was cancelled");
  }
  await Promise.resolve();
  return { orderCount: 0, generatedAt: new Date().toISOString() };
};

const weeklyReportJob = async (run: JobRunContext) => {
  const summary = await buildWeeklySummary(run.signal);
  if (summary.orderCount < 0) {
    return Err("Summary is invalid");
  }
  return Ok(summary);
};

const recordRunEvent = async (event: JobRunEvent): Promise<void> => {
  await Promise.resolve(event.job);
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
  onRecorderError: (job: string) => {
    console.error(`Could not record run event for ${job}`);
  },
};

const services = createServices([
  {
    name: "reports",
    description: "Scheduled reports",
    actions: [],
  },
]);

export const server = await createNileServer({
  serverName: "back-office",
  services: services,
  schedules: schedules,
  rest: { baseUrl: "/api", allowedOrigins: ["https://ops.example.com"] },
});
```

`buildWeeklySummary` is your application function. Replace it with a real query. Nile passes a `JobRunContext` with the job name, run ID, scheduled time and an abort signal. Pass that signal to any work that can be cancelled.

Running the same job by hand is useful in tests and runbooks. `server.scheduler.runNow("weekly-report")` runs it now and returns its Result. In the example project this printed:

```text
jobs: [{"name":"weekly-report","running":true,"active":false,"nextRun":"2026-10-26T06:00:00.000Z"}]
runNow: {"report":"weekly-2026-10-22","path":"outbox/weekly-2026-10-22.json"}
```

## Schedule forms

| Schedule | Example | Notes |
| --- | --- | --- |
| Midnight | `{ midnight: true, timezone: "Africa/Kampala" }` | Every midnight in the timezone. |
| Daily | `{ daily: true, at: "09:00", timezone: "Africa/Kampala" }` | Once a day at the time given. |
| Weekly | `{ weekly: "monday", at: "09:00", timezone: "Africa/Kampala" }` | Once a week on the named day. `at` is optional. |
| Cron | `{ cron: "0 9 * * 1-5", timezone: "Africa/Kampala" }` | Standard five-field cron expression. |
| One time | `{ once: "2027-01-01T09:00:00+03:00" }` | Requires an offset and a future date at registration. |
| Interval | `{ every: "15m" }` or a number of milliseconds | Waits for the previous run to finish, then waits the interval. |

Calendar schedules use UTC when you omit `timezone`.

## Options that matter

| Option | Effect |
| --- | --- |
| `jobs[].name` | Unique job name, used by `runNow` and `inspect`. |
| `jobs[].handler` | Function that receives `JobRunContext`. It may return a value or a Result. |
| `onRunEvent` | Receives `started`, `completed`, `failed` and `skipped` events. |
| `onRecorderError` | Called when recording an event fails. Business work continues. |
| `recorderTimeoutMs`, `recorderCapacity` | Bounds for the recorder. |

`server.scheduler` exposes `inspect()`, `runNow(name)`, `start()`, `stop()` and `drain()`.

## How it behaves

- Overlapping runs are skipped. A job that is still running when its next time arrives does not start a second copy.
- Missed runs are not replayed after a restart.
- Interval jobs wait for the previous run to finish before counting the interval.
- Failures and return values are not stored automatically. Your recorder decides what to keep.
- A stopped scheduler does not restart. Create a new server instance to schedule again.

## Limits

- Every process that has schedules enabled runs them. Two replicas run each job twice unless you run schedules in one process or use an external scheduler.
- One-time jobs are not stored, so a restart before their time forgets them.
- Recording events does not make a run durable.

## Common mistakes

- Enabling schedules on every replica of a web service and assuming each job runs once.
- Forgetting `timezone`. Calendar jobs then run at UTC times.
- Writing the business logic inside the job object. Keep it in a function you can test and call from an action.
- Ignoring the `Err` from a job. Return a Result and record the failure.

## See also

- [Production operations](/guide/reference/operations) covers the scheduler lifecycle and the recorder.
- [Queues, debounce and throttle](/guide/features/queues-debounce-throttle) limits how a job's work runs.
- [Weekly report example](/guide/examples/weekly-report) runs a scheduled job end to end.
