import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGroupedControl } from "./grouped-control";
import { createQueue } from "./queue";
import { createThrottle } from "./throttle";

describe("idle grouped queues", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it("reclaims only truly idle keys, including after early caller cancellation", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const closed = vi.fn();
    const grouped = createGroupedControl({
      key: (key: string) => key,
      maxKeys: 1,
      idleMs: 10,
      create: () => {
        const queue = createQueue({
          task: async (key: string) => {
            await gate;
            return key;
          },
        });
        return {
          ...queue,
          close: () => {
            closed();
            queue.close();
          },
        };
      },
    });
    const controller = new AbortController();
    const running = grouped.run("a", { signal: controller.signal });
    controller.abort();
    await running;
    await vi.advanceTimersByTimeAsync(100);
    expect((await grouped.run("b")).isErr).toBe(true);
    expect(closed).not.toHaveBeenCalled();
    release();
    await grouped.drain();
    await vi.advanceTimersByTimeAsync(10);
    expect(closed).toHaveBeenCalledTimes(1);
    expect((await grouped.run("b")).isOk).toBe(true);
    grouped.close();
    await grouped.drain();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("rejects idle cleanup when a control only exposes a mutating drain", () => {
    const grouped = createGroupedControl({
      key: (key: string) => key,
      idleMs: 10,
      create: () => createThrottle({ task: (key: string) => key, waitMs: 100 }),
    });
    expect(() => grouped.run("a")).toThrow("passive whenIdle");
    grouped.close();
  });
});
