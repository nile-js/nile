import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { applyRateLimiting, applyStaticServing } from "../middleware";
import type { RestConfig } from "../types";

/** Minimal RestConfig factory */
const makeConfig = (overrides?: Partial<RestConfig>): RestConfig => ({
  baseUrl: "/api",
  allowedOrigins: [],
  enableStatus: true,
  ...overrides,
});

/** Capture log calls for assertions */
const makeLogSpy = () => {
  const calls: string[] = [];
  const log = (msg: string, _data?: unknown) => {
    calls.push(msg);
  };
  return { log, calls };
};

// --- applyRateLimiting (isolated) ---

describe("applyRateLimiting - isolated", () => {
  it("should not apply rate limiting when no limitingHeader configured", async () => {
    const app = new Hono();
    const { log, calls } = makeLogSpy();

    applyRateLimiting(app, makeConfig(), log);

    // No middleware added, no log output
    expect(calls).toHaveLength(0);

    // App should still work normally
    app.get("/test", (c) => c.json({ ok: true }));
    const res = await app.request("/test");
    expect(res.status).toBe(200);
  });

  it("should apply rate limiting when limitingHeader is configured", async () => {
    const app = new Hono();
    const { log, calls } = makeLogSpy();

    applyRateLimiting(
      app,
      makeConfig({
        rateLimiting: {
          limitingHeader: "x-api-key",
          limit: 5,
          windowMs: 1000,
        },
      }),
      log
    );

    app.get("/test", (c) => c.json({ ok: true }));

    // Should log that rate limiting is enabled
    expect(calls.some((c) => c.includes("Rate limiting enabled"))).toBe(true);

    // Request with header should succeed
    const res = await app.request("/test", {
      headers: { "x-api-key": "client-1" },
    });
    expect(res.status).toBe(200);
  });

  it("should use UNKNOWN_CLIENT_KEY when header is missing", async () => {
    const app = new Hono();
    const { log, calls } = makeLogSpy();

    applyRateLimiting(
      app,
      makeConfig({
        rateLimiting: {
          limitingHeader: "x-api-key",
          limit: 100,
          windowMs: 60_000,
        },
      }),
      log
    );

    app.get("/test", (c) => c.json({ ok: true }));

    // Request without the header — should still succeed (graceful fallback)
    const res = await app.request("/test");
    expect(res.status).toBe(200);

    // Should log the missing header warning
    expect(calls.some((c) => c.includes("missing from request"))).toBe(true);
  });

  it("should use default window and limit when not specified", () => {
    const app = new Hono();
    const { log, calls } = makeLogSpy();

    applyRateLimiting(
      app,
      makeConfig({
        rateLimiting: { limitingHeader: "x-key" },
      }),
      log
    );

    // Should log defaults: 100 requests per 900000ms
    const enabledLog = calls.find((c) => c.includes("Rate limiting enabled"));
    expect(enabledLog).toBeDefined();
    expect(enabledLog).toContain("100");
    expect(enabledLog).toContain("900000");
  });
});

// --- applyStaticServing (isolated) ---

describe("applyStaticServing - disabled", () => {
  it("should not register middleware when enableStatic is false", async () => {
    const app = new Hono();
    const { log, calls } = makeLogSpy();

    applyStaticServing(app, makeConfig({ enableStatic: false }), "bun", log);

    // No log about static serving
    expect(calls).toHaveLength(0);

    // /assets/* should 404 since no middleware was registered
    app.get("/test", (c) => c.json({ ok: true }));
    const res = await app.request("/assets/image.png");
    expect(res.status).toBe(404);
  });

  it("should not register middleware when enableStatic is undefined", () => {
    const app = new Hono();
    const { log, calls } = makeLogSpy();

    applyStaticServing(app, makeConfig(), "bun", log);

    expect(calls).toHaveLength(0);
  });
});

describe("applyStaticServing - unsupported runtime", () => {
  it("should log and skip for node runtime", () => {
    const app = new Hono();
    const { log, calls } = makeLogSpy();

    applyStaticServing(app, makeConfig({ enableStatic: true }), "node", log);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("not yet supported");
    expect(calls[0]).toContain("node");
  });
});

describe("applyStaticServing - bun runtime", () => {
  /**
   * In bun's test runner, import("hono/bun") succeeds since Bun globals exist.
   * The handler gets cached and attempts to serve from ./assets — which won't
   * exist in test, so the handler returns undefined and falls through to next().
   */

  it("should register middleware at /assets/* and log", () => {
    const app = new Hono();
    const { log, calls } = makeLogSpy();

    applyStaticServing(app, makeConfig({ enableStatic: true }), "bun", log);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("Static file serving enabled");
  });

  it("should fall through to next() when asset file is not found", async () => {
    const app = new Hono();
    const { log } = makeLogSpy();

    applyStaticServing(app, makeConfig({ enableStatic: true }), "bun", log);

    // Add a fallback route after static middleware to catch next() calls
    app.get("/assets/*", (c) => c.json({ fallback: true }));

    const res = await app.request("/assets/nonexistent.png");
    const json = (await res.json()) as { fallback: boolean };

    // Asset doesn't exist → handler falls through → fallback route catches it
    expect(res.status).toBe(200);
    expect(json.fallback).toBe(true);
  });

  it("should cache handler and not re-import on subsequent requests", async () => {
    const app = new Hono();
    const { log, calls } = makeLogSpy();

    applyStaticServing(app, makeConfig({ enableStatic: true }), "bun", log);
    app.get("/assets/*", (c) => c.json({ fallback: true }));

    // First request — triggers dynamic import + caching
    await app.request("/assets/first.png");
    const callCountAfterFirst = calls.length;

    // Second request — should use cached handler, no additional logs
    const res2 = await app.request("/assets/second.png");
    expect(res2.status).toBe(200);

    // No additional import-related logs on second request
    expect(calls.length).toBe(callCountAfterFirst);
  });

  it("should not interfere with non-asset routes", async () => {
    const app = new Hono();
    const { log } = makeLogSpy();

    applyStaticServing(app, makeConfig({ enableStatic: true }), "bun", log);
    app.get("/api/data", (c) => c.json({ data: true }));

    const res = await app.request("/api/data");
    expect(res.status).toBe(200);

    const json = (await res.json()) as { data: boolean };
    expect(json.data).toBe(true);
  });
});
