import { afterEach, describe, expect, it, vi } from "vitest";
import { createNativeRequestContext } from "../context";
import { createNativeRateLimiter } from "../rate-limit";
import type { NativeRestConfig } from "../types";

/** Give every request fresh headers while preserving its configured quota identity. */
function context(headers: Record<string, string> = {}) {
  return createNativeRequestContext(
    new Request("http://localhost/api/services", { headers })
  );
}

/** Keep the configured transport fields identical to the standard adapter tests. */
function config(
  rateLimiting?: NativeRestConfig["rateLimiting"]
): NativeRestConfig {
  return { baseUrl: "/api", allowedOrigins: [], rateLimiting };
}

/** Fail clearly when a configured test unexpectedly receives no limiter. */
function requireLimiter(settings: NativeRestConfig) {
  const run = createNativeRateLimiter(settings);
  if (!run) {
    throw new Error("Expected a configured limiter");
  }
  return run;
}

afterEach(() => vi.useRealTimers());

describe("native rate limiting", () => {
  it("does not allocate a limiter without its configured header", () => {
    expect(createNativeRateLimiter(config())).toBeUndefined();
    expect(
      createNativeRateLimiter(config({ limitingHeader: "" }))
    ).toBeUndefined();
  });

  it("preserves per-key limits, standard headers and the 429 body", async () => {
    const run = requireLimiter(
      config({ limitingHeader: "x-key", limit: 1, windowMs: 60_000 })
    );
    const first = context({ "x-key": "one" });
    expect(await run(first)).toBeUndefined();
    expect(first.headers.get("ratelimit-policy")).toBe("1;w=60");
    expect(first.headers.get("ratelimit-remaining")).toBe("0");
    expect(first.state.get("rateLimit")).toMatchObject({
      used: 1,
      remaining: 0,
      limit: 1,
    });
    const blocked = await run(context({ "x-key": "one" }));
    expect(blocked?.status).toBe(429);
    expect(await blocked?.text()).toBe(
      "Too many requests, please try again later."
    );
    expect(blocked?.headers.get("retry-after")).toBe("60");
    expect(await run(context({ "x-key": "two" }))).toBeUndefined();
  });

  it("does not trust arbitrary forwarded headers as client identity", async () => {
    const run = requireLimiter(config({ limitingHeader: "x-key", limit: 1 }));
    expect(
      await run(context({ "x-forwarded-for": "forged-one" }))
    ).toBeUndefined();
    expect(
      (
        await run(
          context({
            "x-forwarded-for": "forged-two",
            "x-real-ip": "forged-three",
          })
        )
      )?.status
    ).toBe(429);
  });

  it("rolls expired windows without timers or leaking old hit counts", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-18T00:00:00Z"));
    const run = requireLimiter(
      config({ limitingHeader: "x-key", limit: 1, windowMs: 1000 })
    );
    expect(await run(context())).toBeUndefined();
    expect((await run(context()))?.status).toBe(429);
    vi.advanceTimersByTime(1000);
    expect(await run(context())).toBeUndefined();
    vi.advanceTimersByTime(5000);
    expect(await run(context())).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps rate and retry headers disabled when requested", async () => {
    const run = requireLimiter(
      config({ limitingHeader: "x-key", limit: 0, standardHeaders: false })
    );
    const blocked = await run(context());
    expect(blocked?.status).toBe(429);
    expect([...(blocked?.headers.keys() ?? [])]).toEqual(["content-type"]);
  });

  it("initializes a custom store and uses its atomic counts and reset methods", async () => {
    const init = vi.fn();
    const resetKey = vi.fn();
    const get = vi.fn();
    const increment = vi.fn(async () => ({
      totalHits: 2,
      resetTime: new Date(Date.now() + 10_000),
    }));
    const store = { init, resetKey, get, increment, decrement: vi.fn() };
    const run = requireLimiter(
      config({ limitingHeader: "x-key", limit: 1, store })
    );
    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 1, windowMs: 900_000, store })
    );
    const request = context({ "x-key": "custom" });
    expect((await run(request))?.status).toBe(429);
    expect(increment).toHaveBeenCalledWith("custom");
    expect(request.state.get("rateLimitStore")).toMatchObject({
      getKey: expect.any(Function),
      resetKey: expect.any(Function),
    });
  });

  it("propagates custom store failures rather than admitting requests", async () => {
    const store = {
      increment: () => Promise.reject(new Error("Store unavailable")),
      decrement: vi.fn(),
      resetKey: vi.fn(),
    };
    const run = requireLimiter(config({ limitingHeader: "x-key", store }));
    await expect(run(context())).rejects.toThrow("Store unavailable");
  });

  it("fails fast for invalid configuration and invalid store results", async () => {
    expect(() =>
      requireLimiter(config({ limitingHeader: "x-key", windowMs: 0 }))
    ).toThrow("windowMs");
    expect(() =>
      requireLimiter(config({ limitingHeader: "x-key", limit: -1 }))
    ).toThrow("limit");
    const store = {
      increment: () => ({ totalHits: Number.NaN }),
      decrement: vi.fn(),
      resetKey: vi.fn(),
    };
    const run = requireLimiter(config({ limitingHeader: "x-key", store }));
    await expect(run(context())).rejects.toThrow("invalid hit data");
  });
});
