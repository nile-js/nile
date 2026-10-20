import { Ok } from "slang-ts";
import { describe, expect, it } from "vitest";
import z from "zod";
import { createEngine } from "../../engine/engine";
import { createNileContext } from "../../nile/nile";
import {
  checkNativeDiscoveryAccess,
  createNativeIntentHandlers,
} from "../discovery";
import type { NativeRestConfig } from "../types";

/** Create a real engine with a dynamic schema default that reveals conversion work. */
function setup({ cacheSchemas = true, cacheSchema = true } = {}) {
  let conversions = 0;
  const action = {
    name: "main",
    description: "Native discovery",
    cacheSchema,
    validation: z.number().default(() => ++conversions),
    handler: () => Ok({}),
  };
  const engine = createEngine({
    services: [{ name: "test", description: "Test", actions: [action] }],
  });
  const config: NativeRestConfig = {
    baseUrl: "/api",
    allowedOrigins: [],
    discovery: { enabled: true, cacheSchemas },
  };
  const handlers = createNativeIntentHandlers({ config });
  const context = createNileContext();
  const request = {
    intent: "schema" as const,
    service: "test",
    action: "main",
    payload: {},
  };
  return {
    action,
    config,
    engine,
    context,
    handlers,
    request,
    conversions: () => conversions,
    read: () => handlers.schema(engine, request, context),
  };
}

describe("native discovery", () => {
  it("allows execution while discovery is disabled", () => {
    expect(checkNativeDiscoveryAccess("execute", {}, {})).toEqual({
      allowed: true,
    });
  });
  it("denies explore and schema by default", () => {
    for (const intent of ["explore", "schema"]) {
      expect(checkNativeDiscoveryAccess(intent, {}, {})).toEqual({
        allowed: false,
        message: "API discovery is disabled",
      });
    }
  });
  it("requires the configured secret", () => {
    const config = { discovery: { enabled: true, secret: "private" } };
    for (const payload of [undefined, {}, { discoverySecret: "wrong" }]) {
      expect(
        checkNativeDiscoveryAccess("schema", payload, config).allowed
      ).toBe(false);
    }
    expect(
      checkNativeDiscoveryAccess(
        "schema",
        { discoverySecret: "private" },
        config
      )
    ).toEqual({ allowed: true });
  });
  it("converts lazily and caches only requested schemas", async () => {
    const fixture = setup();
    expect(fixture.conversions()).toBe(0);
    await fixture.handlers.explore(
      fixture.engine,
      { ...fixture.request, intent: "explore" },
      fixture.context
    );
    expect(fixture.conversions()).toBe(0);
    expect((await fixture.read()).data.main).toMatchObject({ default: 1 });
    expect((await fixture.read()).data.main).toMatchObject({ default: 1 });
    expect(fixture.conversions()).toBe(1);
  });
  it("respects global schema cache opt out", async () => {
    const fixture = setup({ cacheSchemas: false });
    expect((await fixture.read()).data.main).toMatchObject({ default: 1 });
    expect((await fixture.read()).data.main).toMatchObject({ default: 2 });
  });
  it("respects action schema cache opt out", async () => {
    const fixture = setup({ cacheSchema: false });
    await fixture.read();
    await fixture.read();
    expect(fixture.conversions()).toBe(2);
  });
  it("refreshes when a root schema is replaced", async () => {
    const fixture = setup();
    await fixture.read();
    fixture.action.validation = z.number().default(8);
    expect((await fixture.read()).data.main).toMatchObject({ default: 8 });
  });
  it("does not leak response mutations into cached documents", async () => {
    const fixture = setup();
    const first = await fixture.read();
    Object.assign(first.data.main as object, {
      description: "response mutation",
    });
    expect((await fixture.read()).data.main).not.toHaveProperty("description");
  });
  it("hides REST-invisible actions from discovery", async () => {
    const fixture = setup();
    Object.assign(fixture.action, { visibility: { rest: false } });
    expect((await fixture.read()).status).toBe(false);
    const result = await fixture.handlers.explore(
      fixture.engine,
      { ...fixture.request, intent: "explore" },
      fixture.context
    );
    expect(result.status).toBe(false);
  });
});
