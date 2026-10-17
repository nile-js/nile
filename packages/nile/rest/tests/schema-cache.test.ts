import { Ok } from "slang-ts";
import { describe, expect, it, vi } from "vitest";
import z from "zod";
import { createEngine } from "../../engine/engine";
import { extractActionSchema, handleSchema } from "../intent-handlers";
import { createActionSchemaReader } from "../schema-cache";

describe("lazy action schema reader", () => {
  it("converts lazily and returns independently mutable documents", () => {
    const schema = z.object({ value: z.string() });
    const convert = vi.fn(extractActionSchema);
    const read = createActionSchemaReader({
      isCacheEnabled: () => true,
      readSchema: convert,
    });
    expect(convert).not.toHaveBeenCalled();
    const first = read({ validation: schema });
    const second = read({ validation: schema });
    expect(convert).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    if (!(first?.properties && second?.properties)) {
      throw new Error("Expected object schemas");
    }
    expect(first.properties).not.toBe(second.properties);
    first.description = "response mutation";
    first.properties.value = { type: "number" };
    expect(read({ validation: schema })).toEqual(second);
    expect(Object.hasOwn(first, "~standard")).toBe(false);
  });

  it("refreshes after root identity replacement", () => {
    const action = { validation: z.string().describe("before") };
    const read = createActionSchemaReader({ isCacheEnabled: () => true });
    expect(read(action)).toMatchObject({ description: "before" });
    action.validation = z.string().describe("after");
    expect(read(action)).toMatchObject({ description: "after" });
  });

  it("clears once when global caching is observed disabled and does not revive stale entries", () => {
    let enabled = true;
    let calls = 0;
    const action = { validation: z.number().default(() => ++calls) };
    const read = createActionSchemaReader({ isCacheEnabled: () => enabled });
    expect(read(action)).toMatchObject({ default: 1 });
    expect(read(action)).toMatchObject({ default: 1 });
    enabled = false;
    expect(read(action)).toMatchObject({ default: 2 });
    expect(read(action)).toMatchObject({ default: 3 });
    enabled = true;
    expect(read(action)).toMatchObject({ default: 4 });
    expect(read(action)).toMatchObject({ default: 4 });
  });

  it("evicts an action's schema when that action opts out", () => {
    let calls = 0;
    const action = {
      validation: z.number().default(() => ++calls),
      cacheSchema: true,
    };
    const read = createActionSchemaReader({ isCacheEnabled: () => true });
    expect(read(action)).toMatchObject({ default: 1 });
    action.cacheSchema = false;
    expect(read(action)).toMatchObject({ default: 2 });
    expect(read(action)).toMatchObject({ default: 3 });
    action.cacheSchema = true;
    expect(read(action)).toMatchObject({ default: 4 });
    expect(read(action)).toMatchObject({ default: 4 });
  });

  it("keeps nested metadata dynamic when caching is disabled", () => {
    const child = z.string();
    const action = { validation: z.object({ value: child }) };
    const read = createActionSchemaReader({ isCacheEnabled: () => false });
    expect(read(action)).toMatchObject({
      properties: { value: { type: "string" } },
    });
    z.globalRegistry.add(child, { description: "changed child" });
    expect(read(action)).toMatchObject({
      properties: { value: { description: "changed child" } },
    });
    z.globalRegistry.remove(child);
    expect(read(action)?.properties?.value).not.toHaveProperty("description");
  });

  it("snapshots metadata until a root is replaced under the caching contract", () => {
    const child = z.string();
    const action = { validation: z.object({ value: child }) };
    const read = createActionSchemaReader({ isCacheEnabled: () => true });
    read(action);
    z.globalRegistry.add(child, { description: "changed child" });
    expect(read(action)?.properties?.value).not.toHaveProperty("description");
    action.validation = action.validation.clone();
    expect(read(action)).toMatchObject({
      properties: { value: { description: "changed child" } },
    });
  });

  it("retries failed conversions and leaves missing validation uncached", () => {
    const schema = z.string();
    const circular: { self?: object } = {};
    circular.self = circular;
    z.globalRegistry.add(schema, { detail: circular });
    const convert = vi.fn(extractActionSchema);
    const read = createActionSchemaReader({
      isCacheEnabled: () => true,
      readSchema: convert,
    });
    expect(read({})).toBeNull();
    expect(convert).not.toHaveBeenCalled();
    expect(read({ validation: schema })).toBeNull();
    z.globalRegistry.remove(schema);
    expect(read({ validation: schema })).toMatchObject({ type: "string" });
    expect(read({ validation: schema })).toMatchObject({ type: "string" });
    expect(convert).toHaveBeenCalledTimes(2);
  });

  it("preserves dynamic direct handleSchema and its nonenumerable standard methods", () => {
    let calls = 0;
    const engine = createEngine({
      services: [
        {
          name: "users",
          description: "Users",
          actions: [
            {
              name: "inspect",
              description: "Inspect",
              handler: () => Ok(null),
              validation: z.number().default(() => ++calls),
            },
          ],
        },
      ],
    });
    const request = {
      intent: "schema" as const,
      service: "users",
      action: "inspect",
      payload: {},
    };
    const first = handleSchema(engine, request);
    const second = handleSchema(engine, request);
    expect(first.data.inspect).toMatchObject({ default: 1 });
    expect(second.data.inspect).toMatchObject({ default: 2 });
    expect(
      Object.getOwnPropertyDescriptor(first.data.inspect, "~standard")
        ?.enumerable
    ).toBe(false);
  });
});
