import type { Context } from "hono";
import { Ok } from "slang-ts";
import { describe, expect, it } from "vitest";
import { createNileContext } from "../../nile/nile";
import { runInRequestScope } from "../../nile/request-scope";
import type { NileContext } from "../../nile/types";
import { createRestApp } from "../../rest/rest";
import { createEngine } from "../engine";
import type { HookContext, Service } from "../types";

interface Payload {
  id: string;
}
interface Snapshot {
  id: string;
  stateId: string;
  input: Payload;
  output: Payload;
  stages: string[];
  error?: string;
  beforeIds: string[];
  afterIds: string[];
  requestId?: string;
  sessionId?: string;
}
interface ResponseBody {
  status: boolean;
  data: { data: Snapshot; pipeline: HookContext["log"] };
}

/** Fail fast when a fixture is incorrectly wired instead of hiding a missing context. */
function requireContext(context?: NileContext): NileContext {
  if (!context) {
    throw new Error("Test action requires Nile context");
  }
  return context;
}

/** Append to the current execution's trace, preserving global hook ordering. */
function appendStage(context: NileContext, stage: string): void {
  const stages = context.hookContext.state.stages as string[];
  stages.push(stage);
}

/** Build explicit barriers so overlapping requests do not depend on timers. */
function createBarriers() {
  return {
    enteredA: Promise.withResolvers<void>(),
    enteredB: Promise.withResolvers<void>(),
    releaseA: Promise.withResolvers<void>(),
    releaseB: Promise.withResolvers<void>(),
  };
}

/** Always release suspended handlers, including when a request fails before entering its barrier. */
function overlap<T>({
  dispatch,
  gates,
}: {
  dispatch: (id: string) => Promise<T>;
  gates: ReturnType<typeof createBarriers>;
}): Promise<[T, T]> {
  const first = dispatch("A");
  return Promise.race([
    gates.enteredA.promise,
    first.then(() => {
      throw new Error("A completed before entering its handler");
    }),
  ])
    .then(async () => {
      const second = dispatch("B");
      await Promise.race([
        gates.enteredB.promise,
        second.then(() => {
          throw new Error("B completed before entering its handler");
        }),
      ]);
      gates.releaseA.resolve();
      const a = await first;
      gates.releaseB.resolve();
      return [a, await second] as [T, T];
    })
    .finally(() => {
      gates.releaseA.resolve();
      gates.releaseB.resolve();
    });
}
/** Make one shared engine/context with global hooks and ordinary action hooks. */
function createHarness({ throwsA = false }: { throwsA?: boolean } = {}) {
  const gates = createBarriers();
  const contexts = new Map<string, HookContext>();
  const events: string[] = [];
  const context = createNileContext();
  const services: Service[] = [
    {
      name: "test",
      description: "Isolation fixtures",
      actions: [
        {
          name: "before",
          description: "Before action",
          handler: (data, supplied) => {
            const ctx = requireContext(supplied);
            appendStage(ctx, "action-before");
            return Ok(data);
          },
        },
        {
          name: "after",
          description: "After action",
          handler: (data, supplied) => {
            const ctx = requireContext(supplied);
            appendStage(ctx, "action-after");
            return Ok(data);
          },
        },
        {
          name: "inspect",
          description: "Pause then echo",
          result: { pipeline: true },
          hooks: {
            before: [{ service: "test", action: "before", isCritical: true }],
            after: [{ service: "test", action: "after", isCritical: true }],
          },
          handler: async (data, supplied) => {
            const payload = data as Payload;
            const ctx = requireContext(supplied);
            appendStage(ctx, "handler");
            contexts.set(payload.id, ctx.hookContext);
            if (payload.id === "A") {
              gates.enteredA.resolve();
              await gates.releaseA.promise;
            }
            if (payload.id === "B") {
              gates.enteredB.resolve();
              await gates.releaseB.promise;
            }
            if (throwsA && payload.id === "A") {
              throw new Error("A handler failure");
            }
            return Ok(payload);
          },
        },
      ],
    },
  ];
  const engine = createEngine({
    services,
    onBeforeActionHandler: ({ payload, nileContext }) => {
      const { id } = payload as Payload;
      events.push(`${id}:global-before`);
      nileContext.updateHookState("requestId", id);
      nileContext.updateHookState("stages", ["global-before"]);
      nileContext.setSession("rest", { id });
      return Ok(true);
    },
    onAfterActionHandler: ({ payload, nileContext }) => {
      const { id } = payload as Payload;
      events.push(`${id}:global-after`);
      appendStage(nileContext, "global-after");
      const hook = nileContext.hookContext;
      const snapshot: Snapshot = {
        id,
        stateId: hook.state.requestId as string,
        input: hook.input as Payload,
        output: hook.output as Payload,
        stages: [...(hook.state.stages as string[])],
        error: hook.error,
        beforeIds: hook.log.before.map((entry) => (entry.input as Payload).id),
        afterIds: hook.log.after.map((entry) => (entry.input as Payload).id),
        requestId: nileContext.get<Context>("rest")?.req.header("x-request-id"),
        sessionId: nileContext.getSession("rest")?.id as string | undefined,
      };
      return Ok(snapshot);
    },
  });
  const rest = createRestApp({
    engine,
    nileContext: context,
    serverName: "Isolation",
    runtime: "bun",
    config: {
      baseUrl: "/api",
      allowedOrigins: ["http://test.invalid"],
      diagnostics: false,
      enableStatus: false,
    },
  });
  return { gates, contexts, events, context, engine, rest };
}
/** Check the entire action lifecycle rather than only a successful response payload. */
function expectedSnapshot(id: string): Partial<Snapshot> {
  return {
    id,
    stateId: id,
    input: { id },
    output: { id },
    sessionId: id,
    stages: [
      "global-before",
      "action-before",
      "handler",
      "action-after",
      "global-after",
    ],
    beforeIds: [id],
    afterIds: [id],
  };
}
describe("per-execution hook context isolation", () => {
  it("isolates concurrent HTTP state, input, output and logs while preserving both global hooks", async () => {
    const harness = createHarness();
    const responses = await overlap({
      gates: harness.gates,
      dispatch: async (id) => {
        const response = await harness.rest.app.request("/api/services", {
          method: "POST",
          headers: { "content-type": "application/json", "x-request-id": id },
          body: JSON.stringify({
            intent: "execute",
            service: "test",
            action: "inspect",
            payload: { id },
          }),
        });
        expect(response.status).toBe(200);
        return (await response.json()) as ResponseBody;
      },
    });
    for (const [index, response] of responses.entries()) {
      const id = index === 0 ? "A" : "B";
      expect(response.status).toBe(true);
      expect(response.data.data).toMatchObject(expectedSnapshot(id));
      expect(response.data.data.error).toBeUndefined();
      expect(response.data.data.requestId).toBe(id);
      expect(response.data.pipeline.before.map((entry) => entry.input)).toEqual(
        [{ id }]
      );
      expect(response.data.pipeline.after.map((entry) => entry.input)).toEqual([
        { id },
      ]);
    }
    expect(harness.events).toEqual([
      "A:global-before",
      "B:global-before",
      "A:global-after",
      "B:global-after",
    ]);
    expect(harness.contexts.get("A")).not.toBe(harness.contexts.get("B"));
  });

  it("isolates direct engine calls without a parent HTTP request", async () => {
    const harness = createHarness();
    const results = await overlap({
      gates: harness.gates,
      dispatch: (id) =>
        harness.engine.executeAction(
          "test",
          "inspect",
          { id },
          harness.context
        ),
    });
    for (const [index, result] of results.entries()) {
      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect((result.value as { data: Snapshot }).data).toMatchObject(
          expectedSnapshot(index === 0 ? "A" : "B")
        );
        expect((result.value as { data: Snapshot }).data.error).toBeUndefined();
      }
    }
    expect(harness.contexts.get("A")).not.toBe(harness.contexts.get("B"));
    expect(harness.events).toEqual([
      "A:global-before",
      "B:global-before",
      "A:global-after",
      "B:global-after",
    ]);
  });

  it("keeps a thrown handler error out of another concurrent execution", async () => {
    const harness = createHarness({ throwsA: true });
    const [failed, successful] = await overlap({
      gates: harness.gates,
      dispatch: (id) =>
        harness.engine.executeAction(
          "test",
          "inspect",
          { id },
          harness.context
        ),
    });
    expect(failed.isErr).toBe(true);
    if (failed.isErr) {
      expect(failed.error).toBe("A handler failure");
    }
    expect(successful.isOk).toBe(true);
    if (successful.isOk) {
      expect((successful.value as { data: Snapshot }).data).toMatchObject(
        expectedSnapshot("B")
      );
      expect(
        (successful.value as { data: Snapshot }).data.error
      ).toBeUndefined();
    }
    expect(harness.contexts.get("A")?.error).toBe("A handler failure");
    expect(harness.contexts.get("B")?.error).toBeUndefined();
    expect(harness.events).toEqual([
      "A:global-before",
      "B:global-before",
      "B:global-after",
    ]);
  });

  it("restores outer execution state after a nested action and shares its request session", async () => {
    const context = createNileContext();
    const outerStore = context.hookContext;
    const ws = { connection: { id: "socket" } };
    const rpc = { id: "rpc" };
    const events: string[] = [];
    const engine = createEngine({
      services: [
        {
          name: "nested",
          description: "Nested execution",
          actions: [
            {
              name: "child",
              description: "Child",
              handler: (_data, supplied) => {
                const ctx = requireContext(supplied);
                expect(ctx.hookContext.actionName).toBe("nested.child");
                expect(ctx.get("ws")).toBe(ws);
                expect(ctx.get("rpc")).toBe(rpc);
                expect(ctx.hookContext.state.owner).toBe("child");
                expect(ctx.getSession("rest")).toEqual({ id: "session" });
                ctx.setSession("rest", { id: "updated" });
                return Ok("child result");
              },
            },
            {
              name: "parent",
              description: "Parent",
              handler: async (_data, supplied) => {
                const ctx = requireContext(supplied);
                const parentHook = ctx.hookContext;
                const child = await engine.executeAction(
                  "nested",
                  "child",
                  {},
                  ctx
                );
                expect(child.isOk).toBe(true);
                expect(ctx.hookContext).toBe(parentHook);
                expect(ctx.hookContext.state.owner).toBe("parent");
                expect(ctx.hookContext.actionName).toBe("nested.parent");
                expect(ctx.hookContext.log).toEqual({ before: [], after: [] });
                expect(ctx.getSession("rest")).toEqual({ id: "updated" });
                return Ok("parent result");
              },
            },
          ],
        },
      ],
      onBeforeActionHandler: ({ action, nileContext }) => {
        events.push(`${action.name}:before`);
        nileContext.updateHookState("owner", action.name);
        return Ok(true);
      },
      onAfterActionHandler: ({ action, result }) => {
        events.push(`${action.name}:after`);
        return result;
      },
    });
    const sessions = { rest: { id: "session" } };
    await runInRequestScope({ sessions, ws, rpc }, async () => {
      const result = await engine.executeAction(
        "nested",
        "parent",
        {},
        context
      );
      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value).toBe("parent result");
      }
      expect(context.getSession("rest")).toEqual({ id: "updated" });
    });
    expect(context.hookContext).toBe(outerStore);
    expect(events).toEqual([
      "parent:before",
      "child:before",
      "child:after",
      "parent:after",
    ]);
  });
});
