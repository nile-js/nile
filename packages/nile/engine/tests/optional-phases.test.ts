import { Ok } from "slang-ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createNileContext } from "../../nile/nile";
import { getRequestStore } from "../../nile/request-scope";
import { createEngine } from "../engine";
import type { EngineOptions, HookContext, Service } from "../types";

interface Payload {
  value: number;
}

const pipeline = await import("../pipeline");

afterEach(() => vi.restoreAllMocks());

describe("executeAction optional phases", () => {
  it("omits absent helpers while retaining handler safety and per-action scope", async () => {
    const before = vi.spyOn(pipeline, "runGlobalBeforeHook");
    const after = vi.spyOn(pipeline, "runGlobalAfterHook");
    const hooks = vi.spyOn(pipeline, "processHooks");
    const validation = vi.spyOn(pipeline, "validatePayload");
    const handler = vi.spyOn(pipeline, "runHandler");
    const context = createNileContext();
    const outside = context.hookContext;
    const services: Service[] = [
      {
        name: "test",
        description: "Optional phases",
        actions: [
          {
            name: "plain",
            description: "Plain action",
            hooks: { before: [], after: [] },
            handler: () => {
              expect(getRequestStore()?.hookContext).toBe(context.hookContext);
              expect(context.hookContext).not.toBe(outside);
              expect(context.hookContext.actionName).toBe("test.plain");
              return Ok(Ok(42));
            },
          },
        ],
      },
    ];
    const engine = createEngine({ services });
    const result = await engine.executeAction("test", "plain", {}, context);
    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value).toBe(42);
    }
    expect(context.hookContext).toBe(outside);
    expect(handler).toHaveBeenCalledOnce();
    expect(before).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
    expect(hooks).not.toHaveBeenCalled();
    expect(validation).not.toHaveBeenCalled();
  });

  it("preserves configured phase ordering, transformed payloads and pipeline output", async () => {
    const events: string[] = [];
    const context = createNileContext();
    const services: Service[] = [
      {
        name: "test",
        description: "All phases",
        actions: [
          {
            name: "before",
            description: "Before",
            handler: (data) => {
              events.push("action-before");
              return Ok({ value: (data as Payload).value + 1 });
            },
          },
          {
            name: "after",
            description: "After",
            handler: (data) => {
              events.push("action-after");
              return Ok({ value: (data as Payload).value + 4 });
            },
          },
          {
            name: "main",
            description: "Main",
            result: { pipeline: true },
            hooks: {
              before: [{ service: "test", action: "before", isCritical: true }],
              after: [{ service: "test", action: "after", isCritical: true }],
            },
            validation: z.object({
              value: z.number().transform((value) => {
                events.push("validation");
                return value * 10;
              }),
            }),
            handler: (data) => {
              events.push("handler");
              expect(data).toEqual({ value: 20 });
              return Ok({ value: (data as Payload).value + 3 });
            },
          },
        ],
      },
    ];
    const engine = createEngine({
      services,
      onBeforeActionHandler: ({ payload }) => {
        events.push("global-before");
        expect(payload).toEqual({ value: 1 });
        return Ok({ value: 999 });
      },
      onAfterActionHandler: ({ payload, result }) => {
        events.push("global-after");
        expect(payload).toEqual({ value: 20 });
        expect(result.isOk).toBe(true);
        return Ok({
          value:
            (result.isOk ? (result.value as Payload) : { value: 0 }).value * 2,
        });
      },
    });
    const result = await engine.executeAction(
      "test",
      "main",
      { value: 1 },
      context
    );
    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value).toEqual({
        data: { value: 54 },
        pipeline: {
          before: [
            {
              name: "test.before",
              input: { value: 1 },
              output: { value: 2 },
              passed: true,
            },
          ],
          after: [
            {
              name: "test.after",
              input: { value: 23 },
              output: { value: 27 },
              passed: true,
            },
          ],
        },
      });
    }
    expect(events).toEqual([
      "global-before",
      "action-before",
      "validation",
      "handler",
      "action-after",
      "global-after",
    ]);
  });

  it("observes action schema and hooks added after an earlier execution", async () => {
    const context = createNileContext();
    const services: Service[] = [
      {
        name: "test",
        description: "Mutable config",
        actions: [
          { name: "main", description: "Main", handler: (data) => Ok(data) },
          {
            name: "before",
            description: "Before",
            handler: (data) => Ok({ value: (data as Payload).value + 1 }),
          },
        ],
      },
    ];
    const engine = createEngine({ services });
    const first = await engine.executeAction(
      "test",
      "main",
      { value: 2 },
      context
    );
    expect(first.isOk).toBe(true);
    if (first.isOk) {
      expect(first.value).toEqual({ value: 2 });
    }
    const action = engine.getAction("test", "main");
    expect(action.isOk).toBe(true);
    if (!action.isOk) {
      throw new Error("Test action missing");
    }
    action.value.hooks = {
      before: [{ service: "test", action: "before", isCritical: true }],
    };
    action.value.validation = z.object({
      value: z.number().transform((value) => value * 10),
    });
    const second = await engine.executeAction(
      "test",
      "main",
      { value: 2 },
      context
    );
    expect(second.isOk).toBe(true);
    if (second.isOk) {
      expect(second.value).toEqual({ value: 30 });
    }
  });

  it("retains callback capture timing when a global hook updates the options", async () => {
    const events: string[] = [];
    const options: EngineOptions = {
      services: [
        {
          name: "test",
          description: "Captured hooks",
          actions: [
            { name: "main", description: "Main", handler: () => Ok(42) },
          ],
        },
      ],
      onBeforeActionHandler: () => {
        options.onAfterActionHandler = ({ result }) => {
          events.push("replacement");
          return result;
        };
        return Ok(true);
      },
      onAfterActionHandler: ({ result }) => {
        events.push("captured");
        return result;
      },
    };
    const engine = createEngine(options);
    const context = createNileContext();
    await engine.executeAction("test", "main", {}, context);
    await engine.executeAction("test", "main", {}, context);
    expect(events).toEqual(["captured", "replacement"]);
  });

  it("still captures thrown handler errors on the no-optional-phase path", async () => {
    const context = createNileContext();
    const observed: HookContext[] = [];
    const services: Service[] = [
      {
        name: "test",
        description: "Crash safety",
        actions: [
          {
            name: "fail",
            description: "Fail",
            handler: () => {
              observed.push(context.hookContext);
              throw new Error("handler failed");
            },
          },
        ],
      },
    ];
    const result = await createEngine({ services }).executeAction(
      "test",
      "fail",
      {},
      context
    );
    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error).toBe("handler failed");
    }
    expect(observed[0]?.error).toBe("handler failed");
  });

  it("keeps authentication configured for protected actions before the handler", async () => {
    const handler = vi.fn(() => Ok("must not execute"));
    const services: Service[] = [
      {
        name: "test",
        description: "Protected",
        actions: [
          {
            name: "protected",
            description: "Protected",
            isProtected: true,
            handler,
          },
        ],
      },
    ];
    const engine = createEngine({
      services,
      auth: { secret: "synthetic-test-secret" },
    });
    const result = await engine.executeAction(
      "test",
      "protected",
      {},
      createNileContext()
    );
    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error).toBe(
        "Authentication required: no request context available"
      );
    }
    expect(handler).not.toHaveBeenCalled();
  });
});
