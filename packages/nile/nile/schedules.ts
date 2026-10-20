import { type Result, safeTry } from "slang-ts";
import type { createExecutionRuntime } from "../execution/runtime";
import { createScheduler } from "../scheduling/scheduler";
import type { JobValue, SchedulerOptions } from "../scheduling/types";
import { runInRequestScope } from "./request-scope";
import type { NileServer } from "./types";

/** Bind scheduled functions to Nile's execution context without sending them through HTTP. */
export function attachSchedules(
  server: NileServer,
  options: SchedulerOptions | undefined,
  execution: ReturnType<typeof createExecutionRuntime>
): void {
  if (!options) {
    return;
  }
  const scheduler = createScheduler({
    ...options,
    run: (run, handler) =>
      Promise.resolve(
        runInRequestScope(
          {
            sessions: {},
            execution: {
              requestId: run.runId,
              runId: run.runId,
              job: run.job,
              transport: "cron",
              signal: run.signal,
            },
          },
          () =>
            execution.execute("cron", run.job, () =>
              safeTry(() => handler(run))
            ) as Promise<Result<JobValue, string>>
        )
      ),
  });
  server.scheduler = scheduler;
  server.lifecycle.register({
    name: "schedules",
    stop: () => scheduler.stop(),
    drain: scheduler.drain,
    close: () => scheduler.stop({ abort: true }),
  });
}
