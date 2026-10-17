import { Ok } from "slang-ts";
import { describe, expect, it } from "vitest";
import z from "zod";
import { createEngine } from "../../engine/engine";
import type { Action, Service } from "../../engine/types";
import { createNileContext } from "../../nile/nile";
import type { ExternalRequest, ExternalResponse } from "../../nile/types";
import { createRestApp } from "../rest";
import type { RestConfig } from "../types";

/** Count actual JSON conversion through defaults without changing ordinary validated execution. */
function createHarness() {
  const counts = { primary: 0, secondary: 0 };
  const action: Action<{ value: number }> = {
    name: "inspect",
    description: "Inspect",
    handler: (payload) => Ok(payload),
    validation: z.object({ value: z.number().default(() => ++counts.primary) }),
  };
  const services: Service[] = [
    {
      name: "users",
      description: "Users",
      actions: [
        action,
        {
          name: "other",
          description: "Other",
          handler: () => Ok(null),
          validation: z.number().default(() => ++counts.secondary),
        },
      ],
    },
  ];
  const engine = createEngine({ services });
  const context = createNileContext();
  const config: RestConfig = {
    baseUrl: "/api",
    allowedOrigins: [],
    discovery: { enabled: true },
  };
  const makeApp = () =>
    createRestApp({
      config,
      engine,
      nileContext: context,
      serverName: "Cache",
      runtime: "bun",
    }).app;
  return { counts, action, config, makeApp, app: makeApp() };
}

/** Exercise the real HTTP parser and discovery gate without a listening server. */
async function dispatch({
  app,
  intent = "schema",
  service = "users",
  action = "inspect",
  secret,
  multipart = false,
}: {
  app: ReturnType<typeof createHarness>["app"];
  intent?: ExternalRequest["intent"];
  service?: string;
  action?: string;
  secret?: string;
  multipart?: boolean;
}) {
  const payload = secret
    ? { value: 42, discoverySecret: secret }
    : { value: 42 };
  const form = new FormData();
  form.set("intent", intent);
  form.set("service", service);
  form.set("action", action);
  if (secret) {
    form.set("discoverySecret", secret);
  }
  const response = await app.request("/api/services", {
    method: "POST",
    headers: multipart ? undefined : { "content-type": "application/json" },
    body: multipart
      ? form
      : JSON.stringify({ intent, service, action, payload }),
  });
  return {
    status: response.status,
    body: (await response.json()) as ExternalResponse,
  };
}

describe("lazy HTTP schema discovery cache", () => {
  it("does not convert schemas during setup, explore, or ordinary validation and execution", async () => {
    const fixture = createHarness();
    expect(fixture.counts).toEqual({ primary: 0, secondary: 0 });
    expect(
      (await dispatch({ app: fixture.app, intent: "explore" })).status
    ).toBe(200);
    const executed = await dispatch({ app: fixture.app, intent: "execute" });
    expect(executed.body).toMatchObject({ status: true, data: { value: 42 } });
    expect(fixture.counts).toEqual({ primary: 0, secondary: 0 });
  });

  it("converts only requested definitions and reuses them for service and wildcard discovery", async () => {
    const fixture = createHarness();
    await dispatch({ app: fixture.app });
    await dispatch({ app: fixture.app });
    expect(fixture.counts).toEqual({ primary: 1, secondary: 0 });
    const service = await dispatch({ app: fixture.app, action: "*" });
    expect(service.body.data).toHaveProperty("inspect");
    expect(service.body.data).toHaveProperty("other");
    const all = await dispatch({ app: fixture.app, service: "*", action: "*" });
    expect(all.body.data).toHaveProperty("users.inspect");
    expect(fixture.counts).toEqual({ primary: 1, secondary: 1 });
  });

  it("honors live global and action opt-outs and refreshes a replaced validation root", async () => {
    const fixture = createHarness();
    await dispatch({ app: fixture.app });
    fixture.config.discovery = { enabled: true, cacheSchemas: false };
    await dispatch({ app: fixture.app });
    await dispatch({ app: fixture.app });
    expect(fixture.counts.primary).toBe(3);
    fixture.config.discovery.cacheSchemas = true;
    await dispatch({ app: fixture.app });
    await dispatch({ app: fixture.app });
    expect(fixture.counts.primary).toBe(4);
    fixture.action.cacheSchema = false;
    await dispatch({ app: fixture.app });
    fixture.action.cacheSchema = true;
    await dispatch({ app: fixture.app });
    expect(fixture.counts.primary).toBe(6);
    fixture.action.validation = z
      .object({ value: z.number() })
      .describe("replacement");
    const replaced = await dispatch({ app: fixture.app });
    expect(replaced.body.data.inspect).toMatchObject({
      description: "replacement",
    });
  });

  it("keeps caches separate even when apps share an engine and schemas", async () => {
    const fixture = createHarness();
    const second = fixture.makeApp();
    await dispatch({ app: fixture.app });
    await dispatch({ app: second });
    await dispatch({ app: fixture.app });
    expect(fixture.counts.primary).toBe(2);
  });

  it("checks live visibility and discovery secrets after warming the cache", async () => {
    const fixture = createHarness();
    fixture.config.discovery = { enabled: true, secret: "test-secret" };
    expect((await dispatch({ app: fixture.app, secret: "wrong" })).status).toBe(
      403
    );
    expect(fixture.counts.primary).toBe(0);
    await dispatch({ app: fixture.app, secret: "test-secret" });
    expect((await dispatch({ app: fixture.app, secret: "wrong" })).status).toBe(
      403
    );
    fixture.action.visibility = { rest: false };
    expect(
      (await dispatch({ app: fixture.app, secret: "test-secret" })).status
    ).toBe(400);
    const all = await dispatch({
      app: fixture.app,
      service: "*",
      action: "*",
      secret: "test-secret",
    });
    expect(all.body.data).not.toHaveProperty("users.inspect");
    fixture.config.discovery.enabled = false;
    expect(
      (await dispatch({ app: fixture.app, secret: "test-secret" })).status
    ).toBe(403);
    expect(fixture.counts.primary).toBe(1);
  });

  it("shares lazy conversion between JSON and multipart but still gates multipart requests", async () => {
    const fixture = createHarness();
    fixture.config.discovery = { enabled: true, secret: "test-secret" };
    await dispatch({ app: fixture.app, secret: "test-secret" });
    const multipart = await dispatch({
      app: fixture.app,
      secret: "test-secret",
      multipart: true,
    });
    expect(multipart.status).toBe(200);
    expect(fixture.counts.primary).toBe(1);
    expect(
      (await dispatch({ app: fixture.app, secret: "wrong", multipart: true }))
        .status
    ).toBe(403);
    fixture.config.discovery.enabled = false;
    expect(
      (
        await dispatch({
          app: fixture.app,
          secret: "test-secret",
          multipart: true,
        })
      ).status
    ).toBe(403);
    expect(fixture.counts.primary).toBe(1);
  });
});
