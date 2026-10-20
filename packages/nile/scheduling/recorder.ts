import { safeTry } from "slang-ts";
import type { JobRunEvent, SchedulerOptions } from "./types";

/** Bound persistence callbacks independently from business execution; a stalled writer cannot grow an unlimited backlog. */
export function createRunRecorder(options: SchedulerOptions) {
  const timeoutMs = options.recorderTimeoutMs ?? 1000;
  const capacity = options.recorderCapacity ?? 100;
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 2_147_483_647
  ) {
    throw new Error("Recorder timeout must be a positive bounded integer");
  }
  if (!Number.isSafeInteger(capacity) || capacity < 1) {
    throw new Error("Recorder capacity must be positive");
  }
  const active = new Set<Promise<void>>();
  const report = (job: string) => {
    // A diagnostics callback is untrusted application code too.
    if (options.onRecorderError) {
      safeTry(() => options.onRecorderError?.(job));
    }
  };
  const record = (event: JobRunEvent) => {
    if (!options.onRunEvent) {
      return;
    }
    if (active.size >= capacity) {
      report(event.job);
      return;
    }
    const timer = setTimeout(() => report(event.job), timeoutMs);
    const work = safeTry(() => options.onRunEvent?.(event)).then((result) => {
      clearTimeout(timer);
      active.delete(work);
      if (result.isErr) {
        report(event.job);
      }
    });
    // Timed-out writers still occupy their slot until they actually finish.
    active.add(work);
  };
  return {
    record,
    async drain() {
      if (!active.size) {
        return;
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        Promise.all([...active]),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, timeoutMs);
        }),
      ]);
      if (timer) {
        clearTimeout(timer);
      }
    },
  };
}
