import { Ok } from "slang-ts";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { Service } from "../../engine/types";
import { createNileServer } from "../server";
import type { ExternalResponse } from "../types";

const mockServices: Service[] = [
  {
    name: "users",
    description: "User management",
    actions: [
      {
        name: "createUser",
        description: "Creates a user",
        handler: (data) => Ok({ id: "u1", ...data }),
        validation: z.object({ name: z.string() }),
        accessControl: ["admin"],
      },
    ],
  },
];

describe("createNileServer - Initialization", () => {
  it("should throw if no services provided", () => {
    expect(() =>
      createNileServer({ serverName: "Test", services: [] })
    ).toThrow("at least one service");
  });

  it("should throw if services is undefined", () => {
    // Type assertion to bypass compile-time check — testing runtime guard
    expect(() =>
      createNileServer({ serverName: "Test" } as Parameters<
        typeof createNileServer
      >[0])
    ).toThrow("at least one service");
  });

  it("should return a NileServer with engine and context", () => {
    const server = createNileServer({
      serverName: "Test",
      services: mockServices,
    });

    expect(server.engine).toBeDefined();
    expect(server.context).toBeDefined();
    expect(server.config.serverName).toBe("Test");
  });

  it("should not have rest property when rest config is absent", () => {
    const server = createNileServer({
      serverName: "Test",
      services: mockServices,
    });

    expect(server.rest).toBeUndefined();
  });
});

describe("createNileServer - REST Interface", () => {
  it("should create rest.app when rest config is provided", () => {
    const server = createNileServer({
      serverName: "Test",
      services: mockServices,
      rest: {
        baseUrl: "/api/v1",
        allowedOrigins: ["*"],
        enableStatus: true,
      },
    });

    expect(server.rest).toBeDefined();
    expect(server.rest?.app).toBeDefined();
    expect(server.rest?.config.baseUrl).toBe("/api/v1");
  });

  it("should serve requests through the rest app", async () => {
    const server = createNileServer({
      serverName: "TestServer",
      services: mockServices,
      rest: {
        baseUrl: "/api/v1",
        allowedOrigins: ["*"],
        enableStatus: true,
      },
    });

    const app = server.rest?.app;
    if (!app) {
      expect.fail("REST app should be defined");
      return;
    }

    // Health check
    const statusRes = await app.request("/status");
    const statusJson = (await statusRes.json()) as ExternalResponse;
    expect(statusRes.status).toBe(200);
    expect(statusJson.message).toContain("TestServer");

    // Explore
    const exploreRes = await app.request("/api/v1/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        intent: "explore",
        service: "*",
        action: "*",
        payload: {},
      }),
    });
    const exploreJson = (await exploreRes.json()) as ExternalResponse;
    expect(exploreRes.status).toBe(200);
    expect(exploreJson.status).toBe(true);

    // Execute
    const execRes = await app.request("/api/v1/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        intent: "execute",
        service: "users",
        action: "createUser",
        payload: { name: "Alice" },
      }),
    });
    const execJson = (await execRes.json()) as ExternalResponse;
    expect(execRes.status).toBe(200);
    expect(execJson.status).toBe(true);
    expect(execJson.data.id).toBe("u1");
  });
});

/** Flush microtask queue so fire-and-forget async IIFE in onBoot completes */
const flushMicrotasks = () => new Promise((r) => setTimeout(r, 10));

describe("createNileServer - onBoot", () => {
  it("should run onBoot callback", async () => {
    const bootFn = vi.fn();

    createNileServer({
      serverName: "Test",
      services: mockServices,
      onBoot: { fn: bootFn },
    });

    await flushMicrotasks();
    expect(bootFn).toHaveBeenCalledTimes(1);
  });

  it("should pass nileContext to onBoot callback", async () => {
    let receivedContext: unknown = null;

    createNileServer({
      serverName: "Test",
      services: mockServices,
      onBoot: {
        fn: (ctx) => {
          receivedContext = ctx;
        },
      },
    });

    await flushMicrotasks();
    expect(receivedContext).not.toBeNull();

    const ctx = receivedContext as { _store: Map<string, unknown> };
    expect(ctx._store).toBeInstanceOf(Map);
  });

  it("should not crash if onBoot throws", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {
      // intentional no-op for test
    });

    createNileServer({
      serverName: "Test",
      services: mockServices,
      onBoot: {
        fn: () => {
          throw new Error("Boot failure");
        },
      },
    });

    await flushMicrotasks();
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it("should log services when logServices is true", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {
      // intentional no-op for test
    });

    createNileServer({
      serverName: "Test",
      services: mockServices,
      diagnostics: true,
      onBoot: {
        fn: () => {
          // no-op boot function, testing logServices flag
        },
        logServices: true,
      },
    });

    await flushMicrotasks();
    const calls = logSpy.mock.calls.flat().join(" ");
    expect(calls).toContain("Registered services");

    logSpy.mockRestore();
  });
});

describe("createNileServer - Resources", () => {
  it("should attach resources to the shared context", () => {
    const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

    const server = createNileServer({
      serverName: "Test",
      services: mockServices,
      resources: { logger: mockLogger },
    });

    expect(server.context.resources?.logger).toBe(mockLogger);
  });
});
