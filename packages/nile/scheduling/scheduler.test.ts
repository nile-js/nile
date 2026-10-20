import { Cron } from "croner";
import { Ok } from "slang-ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeSchedule } from "./normalize-schedule";
import { createScheduler } from "./scheduler";
import type { JobRunEvent } from "./types";

afterEach(() => vi.useRealTimers());

describe("Nile scheduling", () => {
  it("uses timezone calendar presets across DST", () => {
    const schedule = normalizeSchedule({
      daily: true,
      at: "09:00",
      timezone: "America/New_York",
    });
    if (schedule.kind !== "calendar") {
      throw new Error("Calendar fixture expected");
    }
    const cron = new Cron(schedule.pattern, {
      timezone: schedule.timezone,
      paused: true,
    });
    expect(cron.nextRun(new Date("2026-03-07T15:00:00Z"))?.toISOString()).toBe(
      "2026-03-08T13:00:00.000Z"
    );
    cron.stop();
  });

  it("registers stopped and runs elapsed intervals after completion", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const events: JobRunEvent[] = [];
    const scheduler = createScheduler({
      jobs: [
        {
          name: "billing",
          schedule: { every: "1s" },
          handler: () => {
            calls++;
            return Ok(null);
          },
        },
      ],
      onRunEvent: (event) => {
        events.push(event);
      },
    });
    await vi.advanceTimersByTimeAsync(2000);
    expect(calls).toBe(0);
    scheduler.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toBe(1);
    scheduler.stop();
    await scheduler.drain();
    expect(events.map((event) => event.phase)).toEqual([
      "started",
      "completed",
    ]);
    expect(events[0]?.runId).toBe(events[1]?.runId);
  });

  it("prevents overlap and isolates recorder failures from job results", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const recorderError = vi.fn();
    const scheduler = createScheduler({
      jobs: [
        {
          name: "job",
          schedule: { cron: "0 0 * * *" },
          handler: async () => {
            await gate;
            return Ok(null);
          },
        },
      ],
      onRunEvent: () => Promise.reject(new Error("Persistence offline")),
      onRecorderError: recorderError,
    });
    const first = scheduler.runNow("job");
    expect((await scheduler.runNow("job")).isErr).toBe(true);
    release();
    expect((await first).isOk).toBe(true);
    scheduler.stop();
    await scheduler.drain();
    expect(recorderError).toHaveBeenCalled();
  });

  it("rejects ambiguous/past once schedules and invalid zones", () => {
    expect(() => normalizeSchedule({ once: "2027-01-01T00:00:00" })).toThrow(
      "offset"
    );
    expect(() => normalizeSchedule({ once: "2020-01-01T00:00:00Z" })).toThrow(
      "future"
    );
    expect(() =>
      normalizeSchedule({ midnight: true, timezone: "Invalid/Zone" })
    ).toThrow();
  });
});
