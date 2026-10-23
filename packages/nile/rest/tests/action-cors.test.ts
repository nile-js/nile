import { type Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { Ok } from "slang-ts";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { applyCorsConfig } from "../../cors/cors";
import { createEngine } from "../../engine/engine";
import type { Action, Service } from "../../engine/types";
import { createNileContext } from "../../nile/nile";
import type { ExternalRequest } from "../../nile/types";
import { createRestApp } from "../rest";
import type { RestConfig } from "../types";

const GLOBAL = "https://global.example";
const CUSTOM = "https://action.example";
const SERVICES = "/api/services";

/** Build ordinary actions so tests exercise the actual parser, engine and response chain. */
function makeAction({
  name,
  cors,
}: {
  name: string;
  cors?: Action["cors"];
}): Action {
  return { name, description: name, cors, handler: () => Ok({ name }) };
}

/** Keep every integration request in memory; no listening servers or global Nile instances. */
function createFixture({
  config = {},
  actions,
}: {
  config?: Partial<RestConfig>;
  actions?: Service["actions"];
} = {}) {
  const restConfig: RestConfig = {
    baseUrl: "/api",
    allowedOrigins: [GLOBAL],
    discovery: { enabled: true },
    enableStatus: true,
    ...config,
  };
  const engine = createEngine({
    services: [
      {
        name: "test",
        description: "Test",
        actions: actions ?? [
          makeAction({ name: "inherit" }),
          makeAction({ name: "explicit", cors: true }),
          makeAction({ name: "disabled", cors: false }),
          makeAction({ name: "custom", cors: { origin: CUSTOM } }),
        ],
      },
    ],
  });
  return {
    ...createRestApp({
      config: restConfig,
      engine,
      nileContext: createNileContext(),
      serverName: "Action CORS",
      runtime: "bun",
    }),
    config: restConfig,
  };
}

/** Send the native execute/discovery envelope with a browser-style Origin. */
function dispatch({
  app,
  action = "inherit",
  origin = GLOBAL,
  intent = "execute",
  multipart = false,
}: {
  app: ReturnType<typeof createFixture>["app"];
  action?: string;
  origin?: string;
  intent?: ExternalRequest["intent"];
  multipart?: boolean;
}) {
  const form = new FormData();
  form.set("intent", intent);
  form.set("service", "test");
  form.set("action", action);
  form.set("value", "ok");
  return app.request(SERVICES, {
    method: "POST",
    headers: multipart
      ? { origin }
      : { origin, "content-type": "application/json" },
    body: multipart
      ? form
      : JSON.stringify({
          intent,
          service: "test",
          action,
          payload: { value: "ok" },
        }),
  });
}

/** Read every actual-response CORS header so tests do not check origin alone. */
function readCorsHeaders(response: Response): string[] {
  return [...response.headers.keys()].filter((key) =>
    key.startsWith("access-control-")
  );
}

describe("per-action CORS through the REST pipeline", () => {
  it.each([
    "inherit",
    "explicit",
  ])("%s inherits the global policy", async (action) => {
    const { app } = createFixture();
    const response = await dispatch({ app, action });
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(GLOBAL);
    expect(response.headers.get("access-control-allow-credentials")).toBe(
      "true"
    );
    expect(response.headers.get("access-control-expose-headers")).toBe(
      "Content-Length"
    );
  });

  it("false skips headers and every inherited dynamic CORS callback", async () => {
    const origin = vi.fn(() => GLOBAL);
    const resolver = vi.fn();
    const { app } = createFixture({
      config: {
        cors: {
          defaults: { origin },
          addCors: [{ path: "/api/*", resolver }],
        },
      },
    });
    const response = await dispatch({ app, action: "disabled" });
    expect(response.status).toBe(200);
    expect(readCorsHeaders(response)).toEqual([]);
    expect(origin).not.toHaveBeenCalled();
    expect(resolver).not.toHaveBeenCalled();
  });

  it("action options override their fields and merge remaining global defaults", async () => {
    const { app } = createFixture({
      config: {
        cors: { defaults: { credentials: true, exposeHeaders: ["X-Global"] } },
      },
      actions: [
        makeAction({
          name: "custom",
          cors: { origin: CUSTOM, credentials: false },
        }),
      ],
    });
    const response = await dispatch({ app, action: "custom", origin: CUSTOM });
    expect(response.headers.get("access-control-allow-origin")).toBe(CUSTOM);
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
    expect(response.headers.get("access-control-expose-headers")).toBe(
      "X-Global"
    );
  });

  it("global disabled is a hard off for inherited and custom action policies", async () => {
    const origin = vi.fn(() => CUSTOM);
    const { app } = createFixture({
      config: { cors: { enabled: false } },
      actions: [
        makeAction({ name: "inherit", cors: true }),
        makeAction({ name: "custom", cors: { origin } }),
      ],
    });
    expect(readCorsHeaders(await dispatch({ app }))).toEqual([]);
    expect(readCorsHeaders(await dispatch({ app, action: "custom" }))).toEqual(
      []
    );
    expect(origin).not.toHaveBeenCalled();
  });

  it("OPTIONS remains global because its shared endpoint has no action body", async () => {
    const { app } = createFixture();
    const response = await app.request(SERVICES, {
      method: "OPTIONS",
      headers: {
        origin: GLOBAL,
        "access-control-request-method": "POST",
      },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(GLOBAL);
    expect(response.headers.get("access-control-allow-methods")).toContain(
      "POST"
    );
  });

  it.each([
    "explore",
    "schema",
  ] as const)("%s keeps global CORS even for a disabled action", async (intent) => {
    const { app } = createFixture();
    const response = await dispatch({ app, action: "disabled", intent });
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(GLOBAL);
  });

  it.each([
    false,
    { origin: CUSTOM },
  ] as const)("selected policy also covers action validation errors", async (cors) => {
    const action = makeAction({ name: "validated", cors });
    action.validation = z.object({ required: z.string() });
    const { app } = createFixture({ actions: [action] });
    const response = await dispatch({
      app,
      action: "validated",
      origin: CUSTOM,
    });
    expect(response.status).toBe(400);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      cors === false ? null : CUSTOM
    );
  });

  it("selects disabled CORS from valid routing before invalid payload-shape rejection", async () => {
    const { app } = createFixture();
    const response = await app.request(SERVICES, {
      method: "POST",
      headers: {
        origin: GLOBAL,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        intent: "execute",
        service: "test",
        action: "disabled",
        payload: null,
      }),
    });
    expect(response.status).toBe(400);
    expect(readCorsHeaders(response)).toEqual([]);
  });

  it.each([
    "{bad",
    JSON.stringify({ intent: "execute" }),
    JSON.stringify({
      intent: "execute",
      service: "test",
      action: "missing",
      payload: {},
    }),
  ])("malformed routing uses inherited fallback", async (body) => {
    const { app } = createFixture();
    const response = await app.request(SERVICES, {
      method: "POST",
      headers: {
        origin: GLOBAL,
        "content-type": "application/json",
      },
      body,
    });
    expect(response.status).toBe(400);
    expect(response.headers.get("access-control-allow-origin")).toBe(GLOBAL);
  });

  it.each([
    "disabled",
    "custom",
  ])("multipart execute selects %s policy", async (action) => {
    const { app } = createFixture();
    const response = await dispatch({
      app,
      action,
      origin: CUSTOM,
      multipart: true,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      action === "disabled" ? null : CUSTOM
    );
  });

  it("multipart content-type rejection uses the selected action policy", async () => {
    const action = makeAction({ name: "jsonOnly", cors: false });
    action.isSpecial = { contentType: "application/json" };
    const { app } = createFixture({
      actions: [action],
      config: { uploads: { enforceContentType: true } },
    });
    const response = await dispatch({
      app,
      action: "jsonOnly",
      multipart: true,
    });
    expect(response.status).toBe(415);
    expect(readCorsHeaders(response)).toEqual([]);
  });

  it("middleware rejection before action routing uses inherited fallback", async () => {
    const { app, addMiddleware } = createFixture();
    addMiddleware("/api", () =>
      Promise.reject(new HTTPException(403, { message: "Blocked" }))
    );
    const response = await dispatch({ app, action: "disabled" });
    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBe(GLOBAL);
  });

  it("dynamic origin callbacks run per request with the current HTTP context", async () => {
    const origin = vi.fn((value: string, context: Context) => {
      expect(context.req.path).toBe(SERVICES);
      return value;
    });
    const { app } = createFixture({
      actions: [makeAction({ name: "dynamic", cors: { origin } })],
    });
    for (const value of [GLOBAL, CUSTOM]) {
      const response = await dispatch({
        app,
        action: "dynamic",
        origin: value,
      });
      expect(response.headers.get("access-control-allow-origin")).toBe(value);
    }
    expect(origin).toHaveBeenCalledTimes(2);
    expect(origin.mock.calls.map(([value]) => value)).toEqual([GLOBAL, CUSTOM]);
  });

  it("overlapping actions retain their own selected policy", async () => {
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const held = makeAction({ name: "held", cors: false });
    held.handler = async () => {
      entered.resolve();
      await release.promise;
      return Ok(null);
    };
    const { app } = createFixture({
      actions: [held, makeAction({ name: "custom", cors: { origin: CUSTOM } })],
    });
    const first = dispatch({ app, action: "held" });
    await entered.promise;
    const second = await dispatch({ app, action: "custom", origin: CUSTOM });
    release.resolve();
    expect(second.headers.get("access-control-allow-origin")).toBe(CUSTOM);
    expect(readCorsHeaders(await first)).toEqual([]);
  });

  it("custom origin policy omits allow-origin for an unlisted request origin", async () => {
    const { app } = createFixture();
    const response = await dispatch({ app, action: "custom", origin: GLOBAL });
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it.each([
    "options",
    "resolver",
  ] as const)("inherits legacy %s rule composition unchanged", async (kind) => {
    const config: Partial<RestConfig> = {
      allowedOrigins: [],
      cors: {
        addCors: [
          {
            path: "/api/*",
            ...(kind === "options"
              ? { options: { origin: CUSTOM } }
              : {
                  resolver: (_origin, _context, helper) =>
                    helper.allowOrigin(CUSTOM),
                }),
          },
        ],
      },
    };
    const fixture = createFixture({ config });
    const baseline = new Hono();
    applyCorsConfig(baseline, fixture.config);
    baseline.post(SERVICES, (c) => c.json({ status: true }));
    const legacy = await baseline.request(SERVICES, {
      method: "POST",
      headers: { origin: CUSTOM },
    });
    const actual = await dispatch({ app: fixture.app, origin: CUSTOM });
    for (const header of [
      "access-control-allow-origin",
      "access-control-allow-credentials",
      "access-control-expose-headers",
      "vary",
    ]) {
      expect(actual.headers.get(header)).toBe(legacy.headers.get(header));
    }
    expect(actual.headers.get("access-control-allow-origin")).toBe(CUSTOM);
  });
});
