import { Ok } from "slang-ts";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createEngine } from "../engine";
import type { Action, ActionSummary, Service } from "../types";

const PAYMENTS_SERVICE_REGEX = /service 'payments'/;

/** Helper to build a minimal service with given name and action names */
const buildService = (name: string, actionNames: string[]): Service => ({
  name,
  description: `${name} service`,
  actions: actionNames.map((actionName) => ({
    name: actionName,
    description: `${actionName} action`,
    isProtected: false,
    handler: () => Ok("ok"),
    validation: null,
    accessControl: [],
  })),
});

const dummyHandler = () => Ok("dummy");

const mockServices: Service[] = [
  {
    name: "auth",
    description: "Authentication service",
    meta: { category: "system" },
    actions: [
      {
        name: "login",
        description: "User login",
        isProtected: false,
        handler: dummyHandler,
        validation: z.object({ username: z.string(), password: z.string() }),
        accessControl: ["public"],
      },
      {
        name: "logout",
        description: "User logout",
        isProtected: true,
        handler: dummyHandler,
        validation: null, // deliberately null schema
        accessControl: ["user"],
      },
    ],
  },
  {
    name: "logs",
    description: "Logging service",
    actions: [
      {
        name: "getLogs",
        description: "Fetch logs",
        isProtected: false,
        handler: dummyHandler,
        validation: z.object({ count: z.number().optional() }),
        accessControl: ["admin"],
      },
    ],
  },
];

describe("Engine Initialization", () => {
  it("should return an object with expected methods", () => {
    const engine = createEngine({ services: mockServices });
    expect(typeof engine.getServices).toBe("function");
    expect(typeof engine.getServiceActions).toBe("function");
    expect(typeof engine.getAction).toBe("function");
  });

  it("should log diagnostics if enabled", () => {
    const spy = vi.spyOn(console, "log");
    createEngine({ services: mockServices, diagnostics: true });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("getServices", () => {
  const engine = createEngine({ services: mockServices });
  it("should return Ok with correct service summaries", () => {
    const result = engine.getServices();
    expect(result.isOk).toBe(true);
    if (!result.isOk) {
      return;
    }
    const data = result.value;
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(2);
    expect(data[0]).toMatchObject({
      name: "auth",
      description: "Authentication service",
      actions: ["login", "logout"],
    });
    expect(data[1]).toMatchObject({
      name: "logs",
      description: "Logging service",
      actions: ["getLogs"],
    });
  });
});

describe("getServiceActions", () => {
  const engine = createEngine({ services: mockServices });
  it("should return Ok with action summaries for valid service", () => {
    const result = engine.getServiceActions("auth");
    expect(result.isOk).toBe(true);
    if (!result.isOk) {
      return;
    }
    const actions: ActionSummary[] = result.value;
    expect(actions.length).toBe(2);
    expect(actions[0]).toMatchObject({
      name: "login",
      description: "User login",
      isProtected: false,
      validation: true,
      accessControl: ["public"],
    });
    expect(actions[1]).toMatchObject({
      name: "logout",
      description: "User logout",
      isProtected: true,
      validation: false, // Should be false because schema is null
      accessControl: ["user"],
    });
  });

  it("should return Err for invalid service name", () => {
    const result = engine.getServiceActions("invalid");
    expect(result.isErr).toBe(true);
  });
});

describe("getAction", () => {
  const engine = createEngine({ services: mockServices });
  it("should return Ok with full action for valid service/action", () => {
    const result = engine.getAction("auth", "login");
    expect(result.isOk).toBe(true);
    if (!result.isOk) {
      return;
    }
    const action: Action = result.value;
    expect(action.name).toBe("login");
    expect(typeof action.handler).toBe("function");
  });

  it("should return Err when action does not exist", () => {
    const result = engine.getAction("auth", "nope");
    expect(result.isErr).toBe(true);
  });

  it("should return Err when service does not exist", () => {
    const result = engine.getAction("badService", "login");
    expect(result.isErr).toBe(true);
  });
});

describe("Duplicate Detection", () => {
  it("should throw on duplicate service names", () => {
    const services = [
      buildService("users", ["create"]),
      buildService("users", ["delete"]),
    ];

    expect(() => createEngine({ services })).toThrow(
      "Duplicate service name 'users'"
    );
  });

  it("should throw on duplicate action names within same service", () => {
    const services = [buildService("orders", ["create", "create"])];

    expect(() => createEngine({ services })).toThrow(
      "Duplicate action name 'create' in service 'orders'"
    );
  });

  it("should allow same action name across different services", () => {
    const services = [
      buildService("users", ["create", "delete"]),
      buildService("orders", ["create", "delete"]),
    ];

    expect(() => createEngine({ services })).not.toThrow();
  });

  it("should allow unique services and actions without throwing", () => {
    const services = [
      buildService("auth", ["login", "logout"]),
      buildService("billing", ["charge", "refund"]),
    ];

    const engine = createEngine({ services });
    const result = engine.getServices();
    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value.length).toBe(2);
    }
  });

  it("should include service name in duplicate action error message", () => {
    const services = [buildService("payments", ["charge", "refund", "charge"])];

    expect(() => createEngine({ services })).toThrow(PAYMENTS_SERVICE_REGEX);
  });

  it("should detect first duplicate even with many actions", () => {
    const services = [
      buildService("analytics", ["track", "report", "export", "track"]),
    ];

    expect(() => createEngine({ services })).toThrow(
      "Duplicate action name 'track' in service 'analytics'"
    );
  });
});
