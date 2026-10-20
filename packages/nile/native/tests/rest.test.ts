import { Ok } from "slang-ts";
import { describe, expect, it } from "vitest";
import z from "zod";
import { createNileServer } from "../../nile/server";
import type { ServerConfig } from "../../nile/types";
import { createNativeHttpError } from "../errors";
import type { NativeRequestContext } from "../types";

const ORIGIN = "https://client.example";
const URL = "http://localhost/api/services";

/** Exercise the public factory without opening a socket. */
async function setup(
  options: Partial<Extract<ServerConfig, { native: true }>> = {}
) {
  const server = await createNileServer({
    runtime: "bun",
    native: true,
    serverName: "Native integration",
    forceNewInstance: true,
    logServices: false,
    diagnostics: false,
    services: [
      {
        name: "test",
        description: "Test",
        actions: [
          {
            name: "main",
            description: "Main",
            handler: (payload, context) => {
              const native = context?.get<NativeRequestContext>("nativeRest");
              return Ok({
                ...payload,
                path: native?.path,
                state: native?.get("value"),
              });
            },
          },
        ],
      },
    ],
    rest: {
      baseUrl: "/api",
      allowedOrigins: [ORIGIN],
      enableStatus: true,
    },
    ...options,
  });
  if (!server.nativeRest) {
    throw new Error("Native transport was not initialized");
  }
  return server.nativeRest;
}

/** Create real Fetch requests with the standard RPC envelope. */
function request({
  action = "main",
  payload = {},
  intent = "execute",
  headers = {},
}: {
  action?: string;
  payload?: Record<string, object | string | number | boolean | null>;
  intent?: string;
  headers?: Record<string, string>;
} = {}) {
  return new Request(URL, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
    body: JSON.stringify({ intent, service: "test", action, payload }),
  });
}

describe("native public REST integration", () => {
  it("exposes native request context to the real engine and late middleware", async () => {
    const app = await setup();
    app.addMiddleware("/api", async (context, next) => {
      context.set("value", "from middleware");
      await next();
      context.setHeader("x-after", "retained");
    });
    const response = await app.fetch(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("x-after")).toBe("retained");
    expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(await response.json()).toMatchObject({
      data: { path: "/api/services", state: "from middleware" },
    });
  });
  it("serves status, JSON404 and bodyless HEAD", async () => {
    const app = await setup();
    const status = await app.fetch(new Request("http://localhost/status"));
    expect(status.status).toBe(200);
    expect(await status.json()).toMatchObject({
      status: true,
      message: "Native integration is running",
    });
    const missing = await app.fetch(new Request("http://localhost/missing"));
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({
      status: false,
      message: "Route not found. Use POST /api/services for all operations.",
    });
    app.route("HEAD", "/head", (context) =>
      context.text("discard this body", 202)
    );
    const head = await app.fetch(
      new Request("http://localhost/head", { method: "HEAD" })
    );
    expect(head.status).toBe(202);
    expect(await head.text()).toBe("");
  });
  it("matches routes registered after construction with parameters and wildcards", async () => {
    const app = await setup();
    app.route("GET", "/users/:id", (context) =>
      context.json({ id: context.params.id })
    );
    app.route("GET", "/files/*", (context) => context.text(context.path));
    const user = await app.fetch(new Request("http://localhost/users/a%20b"));
    expect(await user.json()).toEqual({ id: "a b" });
    expect(
      await (await app.fetch(new Request("http://localhost/files/a/b"))).text()
    ).toBe("/files/a/b");
  });
  it("retains middleware onion ordering and short-circuit responses", async () => {
    const app = await setup();
    const events: string[] = [];
    app.addMiddleware("/custom", async (_context, next) => {
      events.push("outer before");
      await next();
      events.push("outer after");
    });
    app.addMiddleware("/custom", async (_context, next) => {
      events.push("inner before");
      await next();
      events.push("inner after");
    });
    app.route("GET", "/custom", (context) => {
      events.push("route");
      return context.text("ok");
    });
    expect(
      await (await app.fetch(new Request("http://localhost/custom"))).text()
    ).toBe("ok");
    expect(events).toEqual([
      "outer before",
      "inner before",
      "route",
      "inner after",
      "outer after",
    ]);
    app.addMiddleware(
      "/blocked",
      () => new Response("blocked", { status: 418 })
    );
    app.route("GET", "/blocked", () => {
      throw new Error("Must not run");
    });
    const blocked = await app.fetch(new Request("http://localhost/blocked"));
    expect(blocked.status).toBe(418);
    expect(await blocked.text()).toBe("blocked");
  });
  it("preserves deliberate error statuses and sanitizes unexpected route failures", async () => {
    const app = await setup();
    app.addMiddleware("/error", (context) => {
      context.setHeader("x-error", "yes");
      throw createNativeHttpError("Denied", 403);
    });
    const denied = await app.fetch(new Request("http://localhost/error"));
    expect(denied.status).toBe(403);
    expect(denied.headers.get("x-error")).toBe("yes");
    expect(await denied.json()).toEqual({
      status: false,
      message: "Denied",
      data: {},
    });
    app.route("GET", "/crash", () => {
      throw new Error("private crash detail");
    });
    const crashed = await app.fetch(new Request("http://localhost/crash"));
    expect(crashed.status).toBe(500);
    expect(await crashed.json()).toEqual({
      status: false,
      message: "Internal server error",
      data: {},
    });
  });
  it("handles preflight before consuming quota and preserves CORS on429", async () => {
    const app = await setup({
      rest: {
        baseUrl: "/api",
        allowedOrigins: [ORIGIN],
        rateLimiting: {
          limitingHeader: "x-client",
          limit: 1,
          windowMs: 60_000,
        },
      },
    });
    const preflight = await app.fetch(
      new Request(URL, {
        method: "OPTIONS",
        headers: { origin: ORIGIN, "access-control-request-method": "POST" },
      })
    );
    expect(preflight.status).toBe(204);
    expect((await app.fetch(request())).status).toBe(200);
    const limited = await app.fetch(request());
    expect(limited.status).toBe(429);
    expect(limited.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(limited.headers.get("ratelimit-remaining")).toBe("0");
    expect(limited.headers.get("retry-after")).not.toBeNull();
  });
  it("gates discovery secrets and exports schemas through the public route", async () => {
    const app = await setup({
      rest: {
        baseUrl: "/api",
        allowedOrigins: [],
        discovery: { enabled: true, secret: "secret" },
      },
      services: [
        {
          name: "test",
          description: "Test",
          actions: [
            {
              name: "main",
              description: "Main",
              validation: z.object({ value: z.string() }),
              handler: () => Ok({}),
            },
          ],
        },
      ],
    });
    expect((await app.fetch(request({ intent: "schema" }))).status).toBe(403);
    const schema = await app.fetch(
      request({ intent: "schema", payload: { discoverySecret: "secret" } })
    );
    expect(schema.status).toBe(200);
    expect(await schema.json()).toMatchObject({
      status: true,
      data: {
        main: { type: "object", properties: { value: { type: "string" } } },
      },
    });
  });
  it("rejects Bun native with a non-Bun runtime", async () => {
    // JavaScript callers still receive an early error for invalid configuration.
    // @ts-expect-error Bun native cannot be selected for Node.
    await expect(setup({ runtime: "node" })).rejects.toThrow(
      'requires runtime: "bun"'
    );
  });
});
