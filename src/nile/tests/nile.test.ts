import { describe, expect, it } from "vitest";
import { createNileContext } from "../nile";
import type { BaseContext } from "../types";

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

describe("createNileContext - sessions", () => {
  it("should initialize with empty sessions object", () => {
    const ctx = createNileContext();
    expect(ctx.sessions).toBeDefined();
    expect(ctx.sessions.rest).toBeUndefined();
    expect(ctx.sessions.ws).toBeUndefined();
    expect(ctx.sessions.rpc).toBeUndefined();
  });

  it("should set and get session data per interface", () => {
    const ctx = createNileContext();
    const restSession = { token: "abc123", userId: "u1" };

    ctx.setSession("rest", restSession);

    expect(ctx.getSession("rest")).toEqual(restSession);
    expect(ctx.getSession("ws")).toBeUndefined();
  });

  it("should isolate sessions between context instances", () => {
    const ctx1 = createNileContext();
    const ctx2 = createNileContext();

    ctx1.setSession("rest", { token: "ctx1-token" });
    ctx2.setSession("rest", { token: "ctx2-token" });

    expect(ctx1.getSession("rest")).toEqual({ token: "ctx1-token" });
    expect(ctx2.getSession("rest")).toEqual({ token: "ctx2-token" });
  });

  it("should overwrite session data on repeated set", () => {
    const ctx = createNileContext();
    ctx.setSession("ws", { connId: "old" });
    ctx.setSession("ws", { connId: "new" });

    expect(ctx.getSession("ws")).toEqual({ connId: "new" });
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
      info: (_msg: string) => {
        // no-op logger for test
      },
    };
    const ctx = createNileContext({ resources: { logger } });

    expect(ctx.resources?.logger).toBe(logger);
  });

  it("should leave resources undefined when not provided", () => {
    const ctx = createNileContext();
    expect(ctx.resources).toBeUndefined();
  });

  it("should attach interface context fields when provided", () => {
    const mockRestCtx = { req: {} };
    const interfaceContext: BaseContext = {
      rest: mockRestCtx as BaseContext["rest"],
    };
    const ctx = createNileContext({ interfaceContext });

    expect(ctx.rest).toBe(mockRestCtx);
    expect(ctx.ws).toBeUndefined();
    expect(ctx.rpc).toBeUndefined();
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
