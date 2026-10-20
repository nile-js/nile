import { Ok } from "slang-ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createBatch,
  createDebounce,
  createGroupedControl,
  createQueue,
  createRateLimiter,
  createThrottle,
} from "./index";

afterEach(() => vi.useRealTimers());

describe("functional execution controls", () => {
  it("settles replaced debounce callers and isolates grouping keys", async () => {
    vi.useFakeTimers();
    const control = createGroupedControl({
      key: (input: { group: string; value: number }) => input.group,
      create: () =>
        createDebounce({
          waitMs: 20,
          task: (input: { group: string; value: number }) => Ok(input.value),
        }),
    });
    const replaced = control.run({ group: "a", value: 1 });
    const latest = control.run({ group: "a", value: 2 });
    const separate = control.run({ group: "b", value: 3 });
    expect((await replaced).isErr).toBe(true);
    await vi.advanceTimersByTimeAsync(20);
    expect((await latest).expect()).toBe(2);
    expect((await separate).expect()).toBe(3);
    control.close();
  });

  it("throttles starts and runs only the latest trailing call", async () => {
    vi.useFakeTimers();
    const seen: number[] = [];
    const control = createThrottle({
      waitMs: 20,
      trailing: true,
      task: (value: number) => {
        seen.push(value);
        return value;
      },
    });
    const first = control.run(1);
    const replaced = control.run(2);
    const trailing = control.run(3);
    expect((await first).expect()).toBe(1);
    expect((await replaced).isErr).toBe(true);
    await vi.advanceTimersByTimeAsync(20);
    expect((await trailing).expect()).toBe(3);
    expect(seen).toEqual([1, 3]);
    control.close();
  });

  it("bounds FIFO work and retains slots after caller cancellation", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const seen: number[] = [];
    const control = createQueue({
      concurrency: 1,
      capacity: 1,
      task: async (value: number) => {
        seen.push(value);
        if (value === 1) {
          await gate;
        }
        return value;
      },
    });
    const abort = new AbortController();
    const first = control.run(1, { signal: abort.signal });
    const next = control.run(2);
    expect((await control.run(3)).isErr).toBe(true);
    abort.abort();
    expect((await first).isErr).toBe(true);
    expect(seen).toEqual([1]);
    control.stop();
    release();
    expect((await next).expect()).toBe(2);
    await control.drain();
    expect(seen).toEqual([1, 2]);
    expect((await control.run(4)).isErr).toBe(true);
    control.close();
  });

  it("batches by size and time with ordered individual outcomes", async () => {
    vi.useFakeTimers();
    const batches: number[][] = [];
    const control = createBatch({
      size: 2,
      waitMs: 20,
      task: (items: readonly number[]) => {
        batches.push([...items]);
        return items.map((value) => Ok(value * 2));
      },
    });
    const one = control.run(1);
    const two = control.run(2);
    expect((await one).expect()).toBe(2);
    expect((await two).expect()).toBe(4);
    const three = control.run(3);
    await vi.advanceTimersByTimeAsync(20);
    expect((await three).expect()).toBe(6);
    expect(batches).toEqual([[1, 2], [3]]);
    control.close();
  });
});

describe("rate limit strategies", () => {
  it.each(["fixed-window", "sliding-window"] as const)(
    "recovers %s allowance without evicting an active key",
    (strategy) => {
      let now = 0;
      const limiter = createRateLimiter({
        strategy,
        limit: 2,
        windowMs: 100,
        maxKeys: 1,
        clock: () => now,
      });
      expect(limiter.consume({ key: "a" }).expect().allowed).toBe(true);
      expect(limiter.consume({ key: "a" }).expect().allowed).toBe(true);
      expect(limiter.consume({ key: "a" }).expect().allowed).toBe(false);
      expect(limiter.consume({ key: "b" }).expect().reason).toBe("capacity");
      now = 101;
      expect(limiter.consume({ key: "b" }).expect().allowed).toBe(true);
      limiter.close?.();
    }
  );

  it("refills tokens and bounds escalating cooldown", () => {
    let now = 0;
    const limiter = createRateLimiter({
      strategy: "token-bucket",
      capacity: 2,
      refillPerSecond: 1,
      clock: () => now,
      cooldown: { durationMs: 100, multiplier: 2, maxMs: 400 },
    });
    expect(limiter.consume({ key: "a", cost: 2 }).expect().allowed).toBe(true);
    expect(limiter.consume({ key: "a" }).expect().retryAfterMs).toBe(1000);
    now = 50;
    expect(limiter.consume({ key: "a" }).expect().reason).toBe("cooldown");
    now = 1001;
    expect(limiter.consume({ key: "a" }).expect().allowed).toBe(true);
    limiter.close?.();
  });
});
