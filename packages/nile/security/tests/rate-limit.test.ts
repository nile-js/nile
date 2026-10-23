import { afterEach, describe, expect, it, vi } from "vitest";
import { createNativeRequestContext } from "../../native/context";
import { createNativeRateLimiter } from "../../native/rate-limit";
import type { NativeRestConfig } from "../../native/types";

function context(headers: Record<string, string> = {}) {
  return createNativeRequestContext(
    new Request("http://localhost/api/services", { headers })
  );
}

function config(rateLimiting?: NativeRestConfig["rateLimiting"]) {
  return { baseUrl: "/api", allowedOrigins: [], rateLimiting };
}

function requireLimiter(settings: NativeRestConfig) {
  const run = createNativeRateLimiter(settings);
  if (!run) {
    throw new Error("Expected a configured limiter");
  }
  return run;
}

afterEach(() => vi.useRealTimers());

describe("security: rate limiting", () => {
  it("enforces a per-key limit and returns 429 with retry-after", async () => {
    const run = requireLimiter(
      config({ limitingHeader: "x-key", limit: 2, windowMs: 60_000 })
    );
    expect(await run(context({ "x-key": "alice" }))).toBeUndefined();
    expect(await run(context({ "x-key": "alice" }))).toBeUndefined();
    const blocked = await run(context({ "x-key": "alice" }));
    expect(blocked?.status).toBe(429);
    expect(await blocked?.text()).toBe(
      "Too many requests, please try again later."
    );
    expect(blocked?.headers.get("retry-after")).toBe("60");
    // A different key is not affected by alice's quota.
    expect(await run(context({ "x-key": "bob" }))).toBeUndefined();
  });

  it("does not trust arbitrary forwarded headers as client identity", async () => {
    const run = requireLimiter(config({ limitingHeader: "x-key", limit: 1 }));
    // The quota key comes from x-key (the configured limiting header), never
    // from forged X-Forwarded-For / X-Real-IP headers.
    expect(
      await run(context({ "x-key": "victim", "x-forwarded-for": "attacker" }))
    ).toBeUndefined();
    const victimBlocked = await run(
      context({ "x-key": "victim", "x-forwarded-for": "attacker" })
    );
    expect(victimBlocked?.status).toBe(429);
    // A different real key is unaffected even when it carries the victim's
    // forged forwarding headers.
    expect(
      await run(context({ "x-key": "attacker", "x-forwarded-for": "victim" }))
    ).toBeUndefined();
  });

  it("rolls expired windows without leaking old hit counts", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-18T00:00:00Z"));
    const run = requireLimiter(
      config({ limitingHeader: "x-key", limit: 1, windowMs: 60_000 })
    );
    await run(context({ "x-key": "alice" }));
    const firstBlocked = await run(context({ "x-key": "alice" }));
    expect(firstBlocked?.status).toBe(429);

    vi.setSystemTime(new Date("2026-10-18T01:01:00Z")); // past the window
    expect(await run(context({ "x-key": "alice" }))).toBeUndefined();
    vi.useRealTimers();
  });

  it("does not allocate a limiter without a configured header", () => {
    expect(createNativeRateLimiter(config())).toBeUndefined();
  });
});
