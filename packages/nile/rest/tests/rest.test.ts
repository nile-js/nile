import { HTTPException } from "hono/http-exception";
import { Ok } from "slang-ts";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createEngine } from "../../engine/engine";
import type { Service } from "../../engine/types";
import { createNileContext } from "../../nile/nile";
import type { ExternalRequest, ExternalResponse } from "../../nile/types";
import { createRestApp } from "../rest";
import type { RestConfig } from "../types";

// --- Test fixtures ---

const mockServices: Service[] = [
  {
    name: "users",
    description: "User management service",
    actions: [
      {
        name: "createUser",
        description: "Creates a new user",
        handler: (data) => Ok({ id: "u1", ...data }),
        validation: z.object({
          name: z.string(),
          email: z.string().email(),
        }),
        accessControl: ["admin"],
      },
      {
        name: "getUser",
        description: "Fetches a user by ID",
        handler: (data) => Ok({ id: data.userId, name: "Test User" }),
        accessControl: ["public"],
      },
    ],
  },
  {
    name: "logs",
    description: "Logging service",
    actions: [
      {
        name: "getLogs",
        description: "Fetch application logs",
        handler: () => Ok([{ level: "info", message: "ok" }]),
        accessControl: ["admin"],
      },
    ],
  },
];

const restConfig: RestConfig = {
  baseUrl: "/api/v1",
  allowedOrigins: ["http://localhost:8000"],
  enableStatus: true,
  diagnostics: false,
  discovery: { enabled: true },
};

function createTestApp(overrides?: Partial<RestConfig>) {
  const engine = createEngine({ services: mockServices });
  const nileContext = createNileContext();
  const restApp = createRestApp({
    config: { ...restConfig, ...overrides },
    engine,
    nileContext,
    serverName: "TestServer",
    runtime: "bun",
  });
  return {
    app: restApp.app,
    addMiddleware: restApp.addMiddleware,
    engine,
    nileContext,
  };
}

/** Helper to POST a JSON body and parse the response */
async function postServices(
  app: ReturnType<typeof createTestApp>["app"],
  body: ExternalRequest
): Promise<{ status: number; json: ExternalResponse }> {
  const res = await app.request("/api/v1/services", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as ExternalResponse;
  return { status: res.status, json };
}

// --- Tests ---

describe("REST Interface - Explore Intent", () => {
  const { app } = createTestApp();

  it("should list all services with service='*' and action='*'", async () => {
    const { status, json } = await postServices(app, {
      intent: "explore",
      service: "*",
      action: "*",
      payload: {},
    });

    expect(status).toBe(200);
    expect(json.status).toBe(true);
    expect(Array.isArray(json.data.services)).toBe(true);

    const services = json.data.services as Array<{ name: string }>;
    expect(services.length).toBe(2);
    expect(services[0]?.name).toBe("users");
    expect(services[1]?.name).toBe("logs");
  });

  it("should list actions for a specific service", async () => {
    const { status, json } = await postServices(app, {
      intent: "explore",
      service: "users",
      action: "*",
      payload: {},
    });

    expect(status).toBe(200);
    expect(json.status).toBe(true);

    const actions = json.data.actions as Array<{ name: string }>;
    expect(actions.length).toBe(2);
    expect(actions[0]?.name).toBe("createUser");
  });

  it("should return action metadata for a specific action", async () => {
    const { status, json } = await postServices(app, {
      intent: "explore",
      service: "users",
      action: "createUser",
      payload: {},
    });

    expect(status).toBe(200);
    expect(json.status).toBe(true);
    expect(json.data.name).toBe("createUser");
    expect(json.data.description).toBe("Creates a new user");
    expect(json.data.accessControl).toEqual(["admin"]);
  });

  it("should return error for non-existent service", async () => {
    const { status, json } = await postServices(app, {
      intent: "explore",
      service: "nonexistent",
      action: "*",
      payload: {},
    });

    expect(status).toBe(400);
    expect(json.status).toBe(false);
  });

  it("should return error for non-existent action", async () => {
    const { status, json } = await postServices(app, {
      intent: "explore",
      service: "users",
      action: "nonexistent",
      payload: {},
    });

    expect(status).toBe(400);
    expect(json.status).toBe(false);
  });
});

describe("REST Interface - Execute Intent", () => {
  const { app } = createTestApp();

  it("should execute an action and return the result", async () => {
    const { status, json } = await postServices(app, {
      intent: "execute",
      service: "users",
      action: "createUser",
      payload: { name: "Alice", email: "alice@test.com" },
    });

    expect(status).toBe(200);
    expect(json.status).toBe(true);
    expect(json.data.id).toBe("u1");
    expect(json.data.name).toBe("Alice");
  });

  it("should return validation error for invalid payload", async () => {
    const { status, json } = await postServices(app, {
      intent: "execute",
      service: "users",
      action: "createUser",
      payload: { name: "Alice", email: "not-an-email" },
    });

    expect(status).toBe(400);
    expect(json.status).toBe(false);
    expect(json.message).toContain("Validation failed");
  });

  it("should reject wildcards in execute intent", async () => {
    const { status, json } = await postServices(app, {
      intent: "execute",
      service: "*",
      action: "*",
      payload: {},
    });

    expect(status).toBe(400);
    expect(json.status).toBe(false);
    expect(json.message).toContain("wildcards not allowed");
  });

  it("should return error for non-existent service in execute", async () => {
    const { status, json } = await postServices(app, {
      intent: "execute",
      service: "nonexistent",
      action: "doStuff",
      payload: {},
    });

    expect(status).toBe(400);
    expect(json.status).toBe(false);
  });

  it("populates nileContext.rest during a real request", async () => {
    let contextWasPopulated = false;

    const spyService: Service = {
      name: "spy",
      description: "Spy service",
      actions: [
        {
          name: "checkContext",
          description: "Check if rest context is populated",
          handler: (_data, ctx) => {
            contextWasPopulated = ctx?.get?.("rest") !== undefined;
            return Ok({ populated: contextWasPopulated });
          },
          accessControl: ["public"],
        },
      ],
    };

    // Build a fresh engine+context with the spy service
    const engine = createEngine({ services: [spyService] });
    const nileContext = createNileContext();
    const restApp = createRestApp({
      config: restConfig,
      engine,
      nileContext,
      serverName: "SpyServer",
      runtime: "bun",
    });

    const { status, json } = await postServices(restApp.app, {
      intent: "execute",
      service: "spy",
      action: "checkContext",
      payload: {},
    });

    expect(status).toBe(200);
    expect(json.status).toBe(true);
    expect(json.data.populated).toBe(true);
    expect(contextWasPopulated).toBe(true);
  });
});

describe("REST Interface - Schema Intent", () => {
  const { app } = createTestApp();

  it("should return all schemas with service='*'", async () => {
    const { status, json } = await postServices(app, {
      intent: "schema",
      service: "*",
      action: "*",
      payload: {},
    });

    expect(status).toBe(200);
    expect(json.status).toBe(true);
    expect(json.data.users).toBeDefined();
    expect(json.data.logs).toBeDefined();
  });

  it("should return schemas for a specific service", async () => {
    const { status, json } = await postServices(app, {
      intent: "schema",
      service: "users",
      action: "*",
      payload: {},
    });

    expect(status).toBe(200);
    expect(json.status).toBe(true);
    expect(json.data.createUser).toBeDefined();
    expect(json.data.getUser).toBeDefined();
  });

  it("should return schema for a specific action", async () => {
    const { status, json } = await postServices(app, {
      intent: "schema",
      service: "users",
      action: "createUser",
      payload: {},
    });

    expect(status).toBe(200);
    expect(json.status).toBe(true);
    expect(json.data.createUser).toBeDefined();
  });

  it("should return null schema for action without validation", async () => {
    const { status, json } = await postServices(app, {
      intent: "schema",
      service: "users",
      action: "getUser",
      payload: {},
    });

    expect(status).toBe(200);
    expect(json.status).toBe(true);
    expect(json.data.getUser).toBeNull();
  });
});

describe("REST Interface - Request Validation", () => {
  const { app } = createTestApp();

  it("should reject missing body", async () => {
    const res = await app.request("/api/v1/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const json = (await res.json()) as ExternalResponse;

    expect(res.status).toBe(400);
    expect(json.status).toBe(false);
  });

  it("should reject invalid intent", async () => {
    const res = await app.request("/api/v1/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        intent: "invalid",
        service: "*",
        action: "*",
        payload: {},
      }),
    });
    const json = (await res.json()) as ExternalResponse;

    expect(res.status).toBe(400);
    expect(json.status).toBe(false);
    expect(json.message).toBe("Invalid request format");
  });

  it("should reject missing required fields", async () => {
    const res = await app.request("/api/v1/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent: "explore" }),
    });
    const json = (await res.json()) as ExternalResponse;

    expect(res.status).toBe(400);
    expect(json.status).toBe(false);
  });
});

describe("REST Interface - Health Check & 404", () => {
  const { app } = createTestApp();

  it("should return 200 on GET /status", async () => {
    const res = await app.request("/status");
    const json = (await res.json()) as ExternalResponse;

    expect(res.status).toBe(200);
    expect(json.status).toBe(true);
    expect(json.message).toContain("TestServer");
  });

  it("should return 404 for unknown routes", async () => {
    const res = await app.request("/nonexistent");
    const json = (await res.json()) as ExternalResponse;

    expect(res.status).toBe(404);
    expect(json.status).toBe(false);
  });
});

describe("REST Interface - Rate Limiting", () => {
  it("should allow requests when limiting header is provided", async () => {
    const { app } = createTestApp({
      rateLimiting: {
        limitingHeader: "x-api-key",
        windowMs: 60_000,
        limit: 5,
      },
    });

    const res = await app.request("/api/v1/services", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": "valid-key",
      },
      body: JSON.stringify({
        intent: "explore",
        service: "*",
        action: "*",
        payload: {},
      }),
    });
    const json = (await res.json()) as ExternalResponse;

    expect(res.status).toBe(200);
    expect(json.status).toBe(true);
  });

  it("should include rate limit headers in response", async () => {
    const { app } = createTestApp({
      rateLimiting: {
        limitingHeader: "x-api-key",
        windowMs: 60_000,
        limit: 10,
        standardHeaders: true,
      },
    });

    const res = await app.request("/api/v1/services", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": "test-key",
      },
      body: JSON.stringify({
        intent: "explore",
        service: "*",
        action: "*",
        payload: {},
      }),
    });

    // Standard rate limit headers should be present
    expect(res.headers.get("ratelimit-limit")).toBeDefined();
    expect(res.headers.get("ratelimit-remaining")).toBeDefined();
  });

  it("should fall back to IP-based rate limiting when header is missing", async () => {
    const { app } = createTestApp({
      rateLimiting: {
        limitingHeader: "x-api-key",
        windowMs: 60_000,
        limit: 5,
      },
    });

    const res = await app.request("/api/v1/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        intent: "explore",
        service: "*",
        action: "*",
        payload: {},
      }),
    });

    // Falls back to IP-based tracking — request is still processed
    expect(res.status).toBe(200);
  });

  it("should enforce rate limit after exceeding max requests", async () => {
    const { app } = createTestApp({
      rateLimiting: {
        limitingHeader: "x-api-key",
        windowMs: 60_000,
        limit: 2,
      },
    });

    const makeRequest = () =>
      app.request("/api/v1/services", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "burst-test-key",
        },
        body: JSON.stringify({
          intent: "explore",
          service: "*",
          action: "*",
          payload: {},
        }),
      });

    // First two requests should succeed
    const first = await makeRequest();
    expect(first.status).toBe(200);

    const second = await makeRequest();
    expect(second.status).toBe(200);

    // Third request should be rate limited (429)
    const third = await makeRequest();
    expect(third.status).toBe(429);
  });
});

describe("REST Interface - addMiddleware", () => {
  it("should run middleware before the POST handler", async () => {
    const { app, addMiddleware } = createTestApp();
    let middlewareRan = false;

    addMiddleware("/api/v1", async (_c, next) => {
      middlewareRan = true;
      await next();
    });

    await postServices(app, {
      intent: "explore",
      service: "*",
      action: "*",
      payload: {},
    });

    expect(middlewareRan).toBe(true);
  });

  it("should only run middleware when path matches", async () => {
    const { app, addMiddleware } = createTestApp();
    let middlewareRan = false;

    addMiddleware("/unrelated", async (_c, next) => {
      middlewareRan = true;
      await next();
    });

    await postServices(app, {
      intent: "explore",
      service: "*",
      action: "*",
      payload: {},
    });

    expect(middlewareRan).toBe(false);
  });

  it("should chain multiple middleware in registration order", async () => {
    const { app, addMiddleware } = createTestApp();
    const order: number[] = [];

    addMiddleware("/api/v1", async (_c, next) => {
      order.push(1);
      await next();
    });

    addMiddleware("/api/v1", async (_c, next) => {
      order.push(2);
      await next();
    });

    await postServices(app, {
      intent: "explore",
      service: "*",
      action: "*",
      payload: {},
    });

    expect(order).toEqual([1, 2]);
  });

  it("should allow middleware to short-circuit the request", async () => {
    const { app, addMiddleware } = createTestApp();

    addMiddleware("/api/v1", (_c, _next) => {
      throw new HTTPException(403, { message: "Blocked by middleware" });
    });

    const res = await app.request("/api/v1/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        intent: "explore",
        service: "*",
        action: "*",
        payload: {},
      }),
    });

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.message).toBe("Blocked by middleware");
  });

  it("should allow middleware to modify response headers", async () => {
    const { app, addMiddleware } = createTestApp();

    addMiddleware("/api/v1", async (c, next) => {
      await next();
      c.header("X-Custom-Header", "test-value");
    });

    const res = await app.request("/api/v1/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        intent: "explore",
        service: "*",
        action: "*",
        payload: {},
      }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("X-Custom-Header")).toBe("test-value");
  });

  it("throws when middleware limit is exceeded", () => {
    const { addMiddleware: add } = createTestApp();
    // Register 50 middleware (the limit)
    for (let i = 0; i < 50; i++) {
      add("*", async (_c, next) => {
        await next();
      });
    }
    // The 51st should throw
    expect(() =>
      add("*", async (_c, next) => {
        await next();
      })
    ).toThrow("Maximum middleware limit");
  });
});

describe("REST Interface - Discovery Protection", () => {
  it("rejects explore when discovery is disabled (default)", async () => {
    const { app } = createTestApp({ discovery: { enabled: false } });
    const { status, json } = await postServices(app, {
      intent: "explore",
      service: "*",
      action: "*",
      payload: {},
    });
    expect(status).toBe(403);
    expect(json.message).toBe("API discovery is disabled");
  });

  it("rejects schema when discovery is disabled", async () => {
    const { app } = createTestApp({ discovery: { enabled: false } });
    const { status, json } = await postServices(app, {
      intent: "schema",
      service: "*",
      action: "*",
      payload: {},
    });
    expect(status).toBe(403);
    expect(json.message).toBe("API discovery is disabled");
  });

  it("allows explore when discovery is enabled without secret", async () => {
    const { app } = createTestApp({ discovery: { enabled: true } });
    const { status, json } = await postServices(app, {
      intent: "explore",
      service: "*",
      action: "*",
      payload: {},
    });
    expect(status).toBe(200);
    expect(json.status).toBe(true);
  });

  it("rejects explore when secret is wrong", async () => {
    const { app } = createTestApp({
      discovery: { enabled: true, secret: "s3cret" },
    });
    const { status, json } = await postServices(app, {
      intent: "explore",
      service: "*",
      action: "*",
      payload: { discoverySecret: "wrong" },
    });
    expect(status).toBe(403);
    expect(json.message).toBe("Invalid or missing discovery secret");
  });

  it("allows explore when secret matches", async () => {
    const { app } = createTestApp({
      discovery: { enabled: true, secret: "s3cret" },
    });
    const { status, json } = await postServices(app, {
      intent: "explore",
      service: "*",
      action: "*",
      payload: { discoverySecret: "s3cret" },
    });
    expect(status).toBe(200);
    expect(json.status).toBe(true);
  });

  it("does not gate execute intent behind discovery", async () => {
    const { app } = createTestApp({ discovery: { enabled: false } });
    const { status } = await postServices(app, {
      intent: "execute",
      service: "users",
      action: "getUser",
      payload: { userId: "u1" },
    });
    expect(status).toBe(200);
  });
});
