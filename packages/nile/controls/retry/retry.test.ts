import { Ok } from "slang-ts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueue } from "../queue";
import { retryFnWithJitter } from "./retry";

describe("explicit jittered retry", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it("caps the whole delay, bounds history and lets policy choose completion", async () => {
    const delays: number[] = [];
    const lengths: number[] = [];
    const completed = retryFnWithJitter({
      fn: (_signal, attempt) => attempt,
      maxAttempts: 4,
      maxHistory: 2,
      baseDelayMs: 20,
      maxDelayMs: 30,
      jitterMs: 500,
      random: () => 0.99,
      onResult: ({ result, attempts, retry, end }) => {
        delays.push(attempts.at(-1)?.delayBeforeMs ?? -1);
        lengths.push(attempts.length);
        return result.isOk && result.value === 4 ? end(result.value) : retry();
      },
    });
    await vi.runAllTimersAsync();
    const result = await completed;
    expect(result.isOk && result.value).toBe(4);
    expect(delays).toEqual([0, 19, 29, 29]);
    expect(lengths).toEqual([1, 2, 2, 2]);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("cancels backoff without starting another attempt", async () => {
    const controller = new AbortController();
    const fn = vi.fn(() => 1);
    const pending = retryFnWithJitter({
      fn,
      signal: controller.signal,
      initialDelayMs: 50,
      onResult: ({ end }) => end(1),
    });
    await vi.advanceTimersByTimeAsync(1);
    controller.abort();
    const result = await pending;
    expect(result.isErr && result.error).toContain("cancelled");
    expect(fn).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("keeps a queue slot occupied while a timed-out operation ignores cancellation", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const calls = vi.fn(async () => {
      await gate;
      return 1;
    });
    const queue = createQueue({
      task: () =>
        retryFnWithJitter({
          fn: calls,
          timeoutMs: 10,
          onResult: ({ end }) => end(1),
        }),
    });
    const first = queue.run(null);
    await vi.advanceTimersByTimeAsync(11);
    const second = queue.run(null);
    expect(calls).toHaveBeenCalledTimes(1);
    release();
    const expired = await first;
    expect(expired.isErr && expired.error).toContain("deadline");
    expect((await second).isOk).toBe(true);
    await queue.drain();
    queue.close();
    expect(calls).toHaveBeenCalledTimes(2);
  });
  it("does not retry without a policy decision and returns typed string exhaustion", async () => {
    const fn = vi.fn(() => Ok(1));
    const stopped = await retryFnWithJitter({
      fn,
      onResult: ({ stop }) => stop("Business operation finished"),
    });
    expect(stopped.isErr && stopped.error).toBe("Business operation finished");
    expect(fn).toHaveBeenCalledTimes(1);
    const exhausted = await retryFnWithJitter({
      fn,
      maxAttempts: 1,
      onResult: ({ retry }) => retry(),
    });
    expect(exhausted.isErr && exhausted.error).toContain("exhausted");
    const broken = await retryFnWithJitter({
      fn,
      onResult: () => {
        throw new Error("private policy error");
      },
    });
    expect(broken.isErr && broken.error).toBe("Retry policy failed");
  });
});
