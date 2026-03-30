import { describe, expect, it } from "vitest";
import { createNileContext } from "../nile";
import { getRequestStore, runInRequestScope } from "../request-scope";

describe("createNileContext - store (get/set)", () => {
  it("should return undefined for unset keys", () => {
    const ctx = createNileContext();
    expect(ctx.get("missing")).toBeUndefined();
  });

  it("should store and retrieve values by key", () => {
    const ctx = createNileContext();
    ctx.set("user", { id: 1, name: "Alice" });

    expect(ctx.get("user")).toEqual({ id: 1, name: "Alice" });
  });

  it("should support generic type parameter on get", () => {
    const ctx = createNileContext();
    ctx.set("count", 42);

    const count = ctx.get<number>("count");
    expect(count).toBe(42);
  });

  it("should overwrite existing values", () => {
    const ctx = createNileContext();
    ctx.set("key", "first");
    ctx.set("key", "second");

    expect(ctx.get("key")).toBe("second");
  });

  it("should store falsy values correctly", () => {
    const ctx = createNileContext();
    ctx.set("zero", 0);
    ctx.set("empty", "");
    ctx.set("false", false);
    ctx.set("null", null);

    expect(ctx.get("zero")).toBe(0);
    expect(ctx.get("empty")).toBe("");
    expect(ctx.get("false")).toBe(false);
    expect(ctx.get("null")).toBeNull();
  });
});

describe("createNileContext - sessions (per-request via AsyncLocalStorage)", () => {
  it("should return undefined for sessions outside a request scope", () => {
    const ctx = createNileContext();
    expect(ctx.getSession("rest")).toBeUndefined();
    expect(ctx.getSession("ws")).toBeUndefined();
    expect(ctx.getSession("rpc")).toBeUndefined();
  });

  it("should set and get session data within a request scope", async () => {
    const ctx = createNileContext();
    const restSession = { token: "abc123", userId: "u1" };

    await runInRequestScope({ sessions: {} }, () => {
      ctx.setSession("rest", restSession);
      expect(ctx.getSession("rest")).toEqual(restSession);
      expect(ctx.getSession("ws")).toBeUndefined();
    });
  });

  it("should isolate sessions between concurrent request scopes", async () => {
    const ctx = createNileContext();

    const scope1 = runInRequestScope({ sessions: {} }, async () => {
      ctx.setSession("rest", { token: "scope1-token" });
      // Yield to allow scope2 to run
      await new Promise((r) => setTimeout(r, 10));
      return ctx.getSession("rest");
    });

    const scope2 = runInRequestScope({ sessions: {} }, async () => {
      ctx.setSession("rest", { token: "scope2-token" });
      await new Promise((r) => setTimeout(r, 10));
      return ctx.getSession("rest");
    });

    const [result1, result2] = await Promise.all([scope1, scope2]);
    expect(result1).toEqual({ token: "scope1-token" });
    expect(result2).toEqual({ token: "scope2-token" });
  });

  it("should overwrite session data on repeated set within same scope", async () => {
    const ctx = createNileContext();

    await runInRequestScope({ sessions: {} }, () => {
      ctx.setSession("ws", { connId: "old" });
      ctx.setSession("ws", { connId: "new" });
      expect(ctx.getSession("ws")).toEqual({ connId: "new" });
    });
  });
});

describe("createNileContext - request-scoped get() for interface contexts", () => {
  it("should return undefined for rest/ws/rpc outside a request scope", () => {
    const ctx = createNileContext();
    expect(ctx.get("rest")).toBeUndefined();
    expect(ctx.get("ws")).toBeUndefined();
    expect(ctx.get("rpc")).toBeUndefined();
  });

  it("should return the rest context from the current request scope", async () => {
    const ctx = createNileContext();
    const mockHonoCtx = { req: { raw: { headers: new Headers() } } };

    await runInRequestScope(
      { rest: mockHonoCtx as unknown, sessions: {} },
      () => {
        expect(ctx.get("rest")).toBe(mockHonoCtx);
        expect(ctx.get("ws")).toBeUndefined();
        expect(ctx.get("rpc")).toBeUndefined();
      }
    );
  });

  it("should isolate rest contexts between concurrent scopes", async () => {
    const ctx = createNileContext();
    const mockCtxA = { req: { id: "A" } };
    const mockCtxB = { req: { id: "B" } };

    const scopeA = runInRequestScope(
      { rest: mockCtxA as unknown, sessions: {} },
      async () => {
        await new Promise((r) => setTimeout(r, 10));
        return ctx.get("rest");
      }
    );

    const scopeB = runInRequestScope(
      { rest: mockCtxB as unknown, sessions: {} },
      async () => {
        await new Promise((r) => setTimeout(r, 10));
        return ctx.get("rest");
      }
    );

    const [resultA, resultB] = await Promise.all([scopeA, scopeB]);
    expect(resultA).toBe(mockCtxA);
    expect(resultB).toBe(mockCtxB);
  });

  it("should not mix request-scoped keys with global store", () => {
    const ctx = createNileContext();
    ctx.set("rest", "global-value");

    // Outside a request scope, get("rest") reads from ALS (undefined)
    // The global _store has "rest" but get() delegates to ALS for this key
    expect(ctx.get("rest")).toBeUndefined();

    // Non-scoped keys still work from global store
    ctx.set("custom", "value");
    expect(ctx.get("custom")).toBe("value");
  });
});

describe("createNileContext - hookContext", () => {
  it("should initialize with default hookContext shape", () => {
    const ctx = createNileContext();

    expect(ctx.hookContext).toEqual({
      actionName: "",
      input: null,
      state: {},
      log: { before: [], after: [] },
    });
  });

  it("should reset hookContext with new action name and input", () => {
    const ctx = createNileContext();
    // Dirty the context first
    ctx.hookContext.state.key = "value";
    ctx.hookContext.error = "some error";

    ctx.resetHookContext("users.create", { name: "Alice" });

    expect(ctx.hookContext.actionName).toBe("users.create");
    expect(ctx.hookContext.input).toEqual({ name: "Alice" });
    expect(ctx.hookContext.state).toEqual({});
    expect(ctx.hookContext.log).toEqual({ before: [], after: [] });
    expect(ctx.hookContext.error).toBeUndefined();
  });

  it("should update hook state via updateHookState", () => {
    const ctx = createNileContext();
    ctx.updateHookState("validated", true);
    ctx.updateHookState("userId", "u1");

    expect(ctx.hookContext.state).toEqual({ validated: true, userId: "u1" });
  });

  it("should add hook log entries via addHookLog", () => {
    const ctx = createNileContext();
    ctx.addHookLog("before", {
      name: "validateAuth",
      input: { token: "abc" },
      output: { valid: true },
      passed: true,
    });
    ctx.addHookLog("after", {
      name: "logResult",
      input: { result: "ok" },
      output: null,
      passed: true,
    });

    const beforeLogs = ctx.hookContext.log.before;
    const afterLogs = ctx.hookContext.log.after;

    expect(beforeLogs).toHaveLength(1);
    expect(beforeLogs[0]?.name).toBe("validateAuth");
    expect(afterLogs).toHaveLength(1);
    expect(afterLogs[0]?.name).toBe("logResult");
  });

  it("should set hook error via setHookError", () => {
    const ctx = createNileContext();
    ctx.setHookError("Auth hook failed");

    expect(ctx.hookContext.error).toBe("Auth hook failed");
  });

  it("should set hook output via setHookOutput", () => {
    const ctx = createNileContext();
    ctx.setHookOutput({ transformed: true });

    expect(ctx.hookContext.output).toEqual({ transformed: true });
  });
});

describe("createNileContext - params passthrough", () => {
  it("should attach resources when provided", () => {
    const logger = {
      info: (_input: { atFunction: string; message: string; data?: unknown }) =>
        "log-id",
      warn: (_input: { atFunction: string; message: string; data?: unknown }) =>
        "log-id",
      error: (_input: {
        atFunction: string;
        message: string;
        data?: unknown;
      }) => "log-id",
    };
    const ctx = createNileContext({ resources: { logger } });

    expect(ctx.resources?.logger).toBe(logger);
  });

  it("should leave resources undefined when not provided", () => {
    const ctx = createNileContext();
    expect(ctx.resources).toBeUndefined();
  });
});

describe("createNileContext - isolation", () => {
  it("should not share store between instances", () => {
    const ctx1 = createNileContext();
    const ctx2 = createNileContext();

    ctx1.set("key", "ctx1-value");

    expect(ctx1.get("key")).toBe("ctx1-value");
    expect(ctx2.get("key")).toBeUndefined();
  });

  it("should not share hookContext between instances", () => {
    const ctx1 = createNileContext();
    const ctx2 = createNileContext();

    ctx1.updateHookState("marker", "ctx1");

    expect(ctx1.hookContext.state.marker).toBe("ctx1");
    expect(ctx2.hookContext.state.marker).toBeUndefined();
  });
});

describe("getRequestStore", () => {
  it("should return undefined outside a request scope", () => {
    const store = getRequestStore();
    expect(store).toBeUndefined();
  });

  it("should return the current store inside a request scope", async () => {
    const mockStore = {
      sessions: {},
      rest: undefined,
      ws: undefined,
      rpc: undefined,
    };

    await runInRequestScope(mockStore, () => {
      const store = getRequestStore();
      expect(store).toBe(mockStore);
    });
  });
});
