import { Cron } from "croner";
import { Err, safeTry } from "slang-ts";
import { normalizeSchedule } from "./normalize-schedule";
import { createRunRecorder } from "./recorder";
import type {
  JobRunContext,
  NileScheduler,
  ScheduledJob,
  SchedulerOptions,
} from "./types";

/** Register stopped, process-local jobs; the application lifecycle starts them only when ready. */
export function createScheduler(options: SchedulerOptions): NileScheduler {
  const recorder = createRunRecorder(options);
  const states = new Map<string, ReturnType<typeof createJob>>();
  let started = false;
  let stopped = false;

  function createJob(job: ScheduledJob) {
    const schedule = normalizeSchedule(job.schedule);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let nextInterval: Date | null = null;
    let controller: AbortController | undefined;
    let active: ReturnType<NileScheduler["runNow"]> | undefined;
    let nextCalendar: Date | null = null;

    const emit = (
      context: JobRunContext,
      phase: "started" | "completed" | "failed" | "skipped",
      durationMs?: number
    ) => {
      recorder.record({
        job: job.name,
        runId: context.runId,
        phase,
        scheduledAt: context.scheduledAt.toISOString(),
        startedAt: context.startedAt.toISOString(),
        ...(durationMs === undefined
          ? {}
          : { durationMs, finishedAt: new Date().toISOString() }),
        ...(phase === "failed"
          ? {
              message:
                "Scheduled job failed; inspect correlated application logs",
            }
          : {}),
      });
    };
    const run = (scheduledAt = new Date()) => {
      if (stopped) {
        return Promise.resolve(Err("Scheduler is stopped"));
      }
      if (active) {
        emit(
          {
            job: job.name,
            runId: crypto.randomUUID(),
            scheduledAt,
            startedAt: new Date(),
            signal: new AbortController().signal,
          },
          "skipped"
        );
        return Promise.resolve(Err("Scheduled job is already running"));
      }
      controller = new AbortController();
      const context: JobRunContext = {
        job: job.name,
        runId: crypto.randomUUID(),
        scheduledAt,
        startedAt: new Date(),
        signal: controller.signal,
      };
      const startedAt = performance.now();
      emit(context, "started");
      const work = options.run
        ? safeTry(() => options.run?.(context, job.handler))
        : safeTry(() => job.handler(context));
      active = work.then((result) => {
        emit(
          context,
          result.isErr ? "failed" : "completed",
          performance.now() - startedAt
        );
        active = undefined;
        controller = undefined;
        return result;
      });
      return active;
    };
    const arm = () => {
      if (schedule.kind !== "interval" || stopped || !started) {
        return;
      }
      nextInterval = new Date(Date.now() + schedule.delayMs);
      timer = setTimeout(() => {
        timer = undefined;
        const scheduledAt = nextInterval ?? new Date();
        nextInterval = null;
        run(scheduledAt).then(arm);
      }, schedule.delayMs);
    };
    const cron =
      schedule.kind === "calendar"
        ? new Cron(
            schedule.pattern,
            { paused: true, timezone: schedule.timezone },
            () => {
              const scheduledAt = nextCalendar ?? new Date();
              nextCalendar = cron?.nextRun() ?? null;
              return run(scheduledAt).then(() => undefined);
            }
          )
        : undefined;
    if (cron && !cron.nextRun()) {
      cron.stop();
      throw new Error(`Job '${job.name}' has no future scheduled execution`);
    }
    return {
      run,
      start() {
        if (cron) {
          nextCalendar = cron.nextRun();
          cron.resume();
        } else {
          arm();
        }
      },
      stop(abort: boolean) {
        if (timer) {
          clearTimeout(timer);
        }
        timer = undefined;
        nextInterval = null;
        cron?.stop();
        if (abort) {
          controller?.abort();
        }
      },
      drain: () => active ?? Promise.resolve(),
      inspect: () => ({
        name: job.name,
        running: started && !stopped,
        active: !!active,
        nextRun: cron?.nextRun() ?? nextInterval,
      }),
    };
  }

  // Validate every job before any schedule starts, including duplicate names.
  for (const job of options.jobs) {
    if (!job.name || states.has(job.name)) {
      throw new Error(`Invalid or duplicate scheduled job '${job.name}'`);
    }
    states.set(job.name, createJob(job));
  }
  return {
    start() {
      if (stopped) {
        throw new Error(
          "A stopped scheduler cannot restart; create a new scheduler"
        );
      }
      if (started) {
        return;
      }
      started = true;
      for (const state of states.values()) {
        state.start();
      }
    },
    stop({ abort = false } = {}) {
      stopped = true;
      for (const state of states.values()) {
        state.stop(abort);
      }
    },
    async drain() {
      await Promise.all([...states.values()].map((state) => state.drain()));
      await recorder.drain();
    },
    runNow(name) {
      const state = states.get(name);
      return state
        ? state.run()
        : Promise.resolve(Err(`Scheduled job '${name}' not found`));
    },
    inspect: () => [...states.values()].map((state) => state.inspect()),
  };
}
