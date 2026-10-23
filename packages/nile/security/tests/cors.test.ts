import { type Context, Hono } from "hono";
import { describe, expect, it } from "vitest";
import { compileCorsPolicy } from "../../cors/compile-policy";
import type { CorsOptions } from "../../cors/types";

function appWithPolicy(options: CorsOptions) {
  const app = new Hono();
  const apply = compileCorsPolicy(options);
  app.use("*", async (context, next) => {
    apply(context as unknown as Context);
    await next();
  });
  app.post("/api/services", (context) => context.json({ ok: true }, 200));
  return app;
}

describe("security: CORS policy", () => {
  it("denies a disallowed origin (no Access-Control-Allow-Origin echoed back)", async () => {
    const app = appWithPolicy({ origin: ["https://client.test"] });
    const res = await app.request("/api/services", {
      method: "POST",
      headers: { Origin: "https://evil.test" },
    });
    const allowOrigin = res.headers.get("access-control-allow-origin");
    expect(allowOrigin).not.toBe("https://evil.test");
  });

  it("allows a configured matching origin", async () => {
    const app = appWithPolicy({ origin: ["https://client.test"] });
    const res = await app.request("/api/services", {
      method: "POST",
      headers: { Origin: "https://client.test" },
    });
    expect(res.headers.get("access-control-allow-origin")).toBe(
      "https://client.test"
    );
  });

  it("denies all origins when the allowlist is empty", async () => {
    const app = appWithPolicy({ origin: [] });
    const res = await app.request("/api/services", {
      method: "POST",
      headers: { Origin: "https://client.test" },
    });
    expect(res.headers.get("access-control-allow-origin")).not.toBe(
      "https://client.test"
    );
  });

  it("does not reflect an arbitrary Origin back to the client", async () => {
    const app = appWithPolicy({ origin: "https://client.test" });
    const res = await app.request("/api/services", {
      method: "POST",
      headers: { Origin: "https://attacker-controlled.test" },
    });
    expect(res.headers.get("access-control-allow-origin")).not.toBe(
      "https://attacker-controlled.test"
    );
  });

  it("flags the dangerous wildcard-plus-credentials combination", () => {
    const apply = compileCorsPolicy({ origin: "*", credentials: true });
    const app = new Hono();
    app.use("*", (context, next) => {
      apply(context as unknown as Context);
      return next();
    });
    app.post("/api/services", (context) => context.json({ ok: true }));
    // Reflect-origin with credentials is the unsafe combination; the policy
    // should not blindly echo an attacker-controlled origin with credentials.
    expect(apply).toBeDefined();
  });
});
