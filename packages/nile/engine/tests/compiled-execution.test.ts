import { Err, Ok } from "slang-ts";
import { describe, expect, it } from "vitest";
import { createNileContext } from "../../nile/nile";
import { createEngine } from "../engine";
import type { Action, Service } from "../types";

/** Use real action references so configuration changes exercise registered execution plans. */
function setup(actions: Action[]) {
  const services: Service[] = [
    { name: "test", description: "Compiled execution", actions },
  ];
  return { engine: createEngine({ services }), context: createNileContext() };
}

describe("compiled action execution compatibility", () => {
  it("runs after hooks added by the handler during that same execution", async () => {
    const events: string[] = [];
    const main: Action = {
      name: "main",
      description: "Main",
      handler: () => {
        events.push("handler");
        main.hooks = {
          after: [{ service: "test", action: "after", isCritical: true }],
        };
        return Ok(5);
      },
    };
    const after: Action = {
      name: "after",
      description: "After",
      handler: (value) => {
        events.push("after");
        return Ok(Number(value) * 2);
      },
    };
    const { engine, context } = setup([main, after]);
    const result = await engine.executeAction("test", "main", {}, context);
    expect(result.isOk && result.value).toBe(10);
    expect(events).toEqual(["handler", "after"]);
  });

  it("observes replaced handlers and retains Result methods without hooks", async () => {
    const action: Action = {
      name: "main",
      description: "Main",
      handler: () => Ok(1),
    };
    const { engine, context } = setup([action]);
    expect(
      (await engine.executeAction("test", "main", {}, context)).expect()
    ).toBe(1);
    action.handler = () => Ok(2);
    const result = await engine.executeAction("test", "main", {}, context);
    expect(result.expect()).toBe(2);
    const mapped = await result.andThen((value) => Number(value) + 1);
    expect(mapped.expect()).toBe(3);
  });

  it("preserves recursive success and error normalization for synchronous and async handlers", async () => {
    const { engine, context } = setup([
      { name: "nested", description: "Nested", handler: () => Ok(Ok(7)) },
      {
        name: "failure",
        description: "Failure",
        handler: async () => Ok(Err("nested failure")),
      },
      {
        name: "reject",
        description: "Reject",
        handler: () => Promise.reject(new Error("rejected")),
      },
    ]);
    expect(
      (await engine.executeAction("test", "nested", {}, context)).expect()
    ).toBe(7);
    for (const [name, message] of [
      ["failure", "nested failure"],
      ["reject", "rejected"],
    ] as const) {
      const result = await engine.executeAction("test", name, {}, context);
      expect(result.isErr && result.error).toBe(message);
      expect(() => result.expect()).toThrow(message);
    }
  });

  it("keeps missing service/action failures asynchronous and preserves messages", async () => {
    const { engine, context } = setup([]);
    const service = engine.executeAction("missing", "main", {}, context);
    expect(service).toBeInstanceOf(Promise);
    const missingService = await service;
    expect(missingService.isErr && missingService.error).toBe(
      "Service 'missing' not found"
    );
    const missingAction = await engine.executeAction(
      "test",
      "missing",
      {},
      context
    );
    expect(missingAction.isErr && missingAction.error).toBe(
      "Action 'missing' not found in service 'test'"
    );
  });
});
