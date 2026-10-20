import type { Result } from "slang-ts";

export type Weekday =
  | "sunday"
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday";
export type ScheduleDuration = `${number}${"ms" | "s" | "m" | "h" | "d"}`;
export type JobSchedule =
  | { midnight: true; timezone?: string }
  | { daily: true; at: string; timezone?: string }
  | { weekly: Weekday; at?: string; timezone?: string }
  | { cron: string; timezone?: string }
  | { once: string | Date }
  /** Elapsed delay after completion, so slow jobs do not build a backlog. */
  | { every: ScheduleDuration | number };

export interface JobRunContext {
  job: string;
  runId: string;
  scheduledAt: Date;
  startedAt: Date;
  signal: AbortSignal;
}

export interface JobRunEvent {
  job: string;
  runId: string;
  phase: "started" | "completed" | "failed" | "skipped";
  scheduledAt: string;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  /** Framework messages only; raw handler errors and return values are not persisted automatically. */
  message?: string;
}

export type JobValue = undefined | null | string | number | boolean | object;
export type JobHandler = (
  context: JobRunContext
) =>
  | JobValue
  | Result<JobValue, string>
  | Promise<JobValue | Result<JobValue, string>>;

export interface ScheduledJob {
  name: string;
  schedule: JobSchedule;
  handler: JobHandler;
}

export interface SchedulerOptions {
  jobs: readonly ScheduledJob[];
  onRunEvent?: (event: JobRunEvent) => void | Promise<void>;
  onRecorderError?: (job: string) => void;
  /** Slow persistence must not prevent a business job from starting. */
  recorderTimeoutMs?: number;
  recorderCapacity?: number;
  /** Parent integration supplies per-run isolation and optional telemetry. */
  run?: (
    context: JobRunContext,
    handler: JobHandler
  ) => Promise<Result<JobValue, string>>;
}

export interface ScheduledJobInfo {
  name: string;
  running: boolean;
  active: boolean;
  nextRun: Date | null;
}

export interface NileScheduler {
  start: () => void;
  /** Permanently stop future schedules; optionally request cancellation of active work. */
  stop: (options?: { abort?: boolean }) => void;
  drain: () => Promise<void>;
  runNow: (name: string) => Promise<Result<JobValue, string>>;
  inspect: () => ScheduledJobInfo[];
}
