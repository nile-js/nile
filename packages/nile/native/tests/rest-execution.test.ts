import { Err, Ok } from "slang-ts";
import { describe, expect, it } from "vitest";
import z from "zod";
import { createNileServer } from "../../nile/server";
import type { NativeRequestContext } from "../types";

/** Send an action envelope through the actual native REST entry point. */
function request(action: string, payload = {}) {
  return new Request("http://localhost/api/services", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      intent: "execute",
      service: "test",
      action,
      payload,
    }),
  });
}

describe("native execution pipeline integration", () => {
  it("restores parent hook state after nested engine actions while sharing native request sessions", async () => {
    let server: Awaited<ReturnType<typeof createNileServer>>;
    server = await createNileServer({
      runtime: "bun",
      native: true,
      serverName: "Native nesting",
      forceNewInstance: true,
      logServices: false,
      diagnostics: false,
      rest: {
        baseUrl: "/api",
        allowedOrigins: [],
        cors: { enabled: false },
      },
      services: [
        {
          name: "test",
          description: "Test",
          actions: [
            {
              name: "child",
              description: "Child",
              handler: (_payload, context) => {
                if (!context) {
                  throw new Error("Missing context");
                }
                context.updateHookState("identity", "child");
                context.setSession("rest", { fromChild: true });
                return Ok({
                  identity: context.hookContext.state.identity,
                  path: context.get<NativeRequestContext>("nativeRest")?.path,
                });
              },
            },
            {
              name: "main",
              description: "Parent",
              handler: async (_payload, context) => {
                if (!context) {
                  throw new Error("Missing context");
                }
                const parent = context.hookContext;
                context.updateHookState("identity", "parent");
                const child = await server.engine.executeAction(
                  "test",
                  "child",
                  {},
                  context
                );
                if (child.isErr) {
                  return child;
                }
                return Ok({
                  identity: context.hookContext.state.identity,
                  restored: parent === context.hookContext,
                  session: context.getSession("rest"),
                  child: child.value,
                });
              },
            },
          ],
        },
      ],
    });
    if (!server.nativeRest) {
      throw new Error("Native transport not initialized");
    }
    const response = await server.nativeRest.fetch(request("main"));
    expect(await response.json()).toMatchObject({
      data: {
        identity: "parent",
        restored: true,
        session: { fromChild: true },
        child: { identity: "child", path: "/api/services" },
      },
    });
  });
  it("retains global/local hook order, transformed validation and recursive Results", async () => {
    const events: string[] = [];
    const server = await createNileServer({
      runtime: "bun",
      native: true,
      serverName: "Native phases",
      forceNewInstance: true,
      logServices: false,
      diagnostics: false,
      rest: {
        baseUrl: "/api",
        allowedOrigins: [],
        cors: { enabled: false },
      },
      onBeforeActionHandler: () => {
        events.push("global-before");
        return Ok(true);
      },
      onAfterActionHandler: ({ result }) => {
        events.push("global-after");
        return result;
      },
      services: [
        {
          name: "test",
          description: "Test",
          actions: [
            {
              name: "before",
              description: "Before",
              handler: () => {
                events.push("before");
                return Ok({ value: "5" });
              },
            },
            {
              name: "after",
              description: "After",
              handler: (payload) => {
                events.push("after");
                return Ok(payload);
              },
            },
            {
              name: "main",
              description: "Main",
              result: { pipeline: true },
              validation: z.object({
                value: z.string().transform((value) => {
                  events.push("validation");
                  return Number(value);
                }),
              }),
              hooks: {
                before: [
                  { service: "test", action: "before", isCritical: true },
                ],
                after: [{ service: "test", action: "after", isCritical: true }],
              },
              handler: (payload) => {
                events.push("handler");
                return Ok(Ok(payload));
              },
            },
            {
              name: "failure",
              description: "Failure",
              handler: () => Ok(Err("nested failure")),
            },
          ],
        },
      ],
    });
    if (!server.nativeRest) {
      throw new Error("Native transport not initialized");
    }
    const response = await server.nativeRest.fetch(request("main"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: {
        data: { value: 5 },
        pipeline: { before: [{ passed: true }], after: [{ passed: true }] },
      },
    });
    expect(events).toEqual([
      "global-before",
      "before",
      "validation",
      "handler",
      "after",
      "global-after",
    ]);
    const failure = await server.nativeRest.fetch(request("failure"));
    expect(failure.status).toBe(400);
    expect(await failure.json()).toMatchObject({ message: "nested failure" });
  });
  it("isolates overlapping native identity, action state and request sessions", async () => {
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const server = await createNileServer({
      runtime: "bun",
      native: true,
      serverName: "Native isolation",
      forceNewInstance: true,
      logServices: false,
      diagnostics: false,
      rest: {
        baseUrl: "/api",
        allowedOrigins: [],
        cors: { enabled: false },
      },
      services: [
        {
          name: "test",
          description: "Test",
          actions: [
            {
              name: "main",
              description: "Main",
              handler: async (payload, context) => {
                if (!context) {
                  throw new Error("Missing context");
                }
                context.setSession("rest", { id: payload.id });
                context.updateHookState("id", payload.id);
                const native = context.get<NativeRequestContext>("nativeRest");
                native?.set("identity", String(payload.id));
                if (payload.id === "A") {
                  entered.resolve();
                  await release.promise;
                } else {
                  await entered.promise;
                  release.resolve();
                }
                return Ok({
                  id: payload.id,
                  hook: context.hookContext.state.id,
                  session: context.getSession("rest")?.id,
                  native: context
                    .get<NativeRequestContext>("nativeRest")
                    ?.get("identity"),
                  hasHono: Boolean(context.get("rest")),
                });
              },
            },
          ],
        },
      ],
    });
    if (!server.nativeRest) {
      throw new Error("Native transport not initialized");
    }
    const app = server.nativeRest;
    const responses = await Promise.all(
      ["A", "B"].map(async (id) => {
        const response = await app.fetch(request("main", { id }));
        return response.json();
      })
    );
    expect(responses[0]).toMatchObject({
      data: { id: "A", hook: "A", session: "A", native: "A", hasHono: false },
    });
    expect(responses[1]).toMatchObject({
      data: { id: "B", hook: "B", session: "B", native: "B", hasHono: false },
    });
  });
});
