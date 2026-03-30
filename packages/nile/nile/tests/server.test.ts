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
      createNileServer({
        serverName: "Test",
        services: [],
        forceNewInstance: true,
      })
    ).toThrow("at least one service");
  });

  it("should throw if services is undefined", () => {
    // Type assertion to bypass compile-time check — testing runtime guard
    expect(() =>
      createNileServer({
        serverName: "Test",
        forceNewInstance: true,
      } as Parameters<typeof createNileServer>[0])
    ).toThrow("at least one service");
  });

  it("should return a NileServer with engine and context", () => {
    const server = createNileServer({
      serverName: "Test",
      services: mockServices,
      forceNewInstance: true,
    });

    expect(server.engine).toBeDefined();
    expect(server.context).toBeDefined();
    expect(server.config.serverName).toBe("Test");
  });

  it("should not have rest property when rest config is absent", () => {
    const server = createNileServer({
      serverName: "Test",
      services: mockServices,
      forceNewInstance: true,
    });

    expect(server.rest).toBeUndefined();
  });
});

describe("createNileServer - REST Interface", () => {
  it("should create rest.app when rest config is provided", () => {
    const server = createNileServer({
      serverName: "Test",
      services: mockServices,
      forceNewInstance: true,
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
      forceNewInstance: true,
      rest: {
        baseUrl: "/api/v1",
        allowedOrigins: ["*"],
        enableStatus: true,
        discovery: { enabled: true },
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
      forceNewInstance: true,
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
      forceNewInstance: true,
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

  it("should exit process when onBoot fails", async () => {
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);

    createNileServer({
      serverName: "Test",
      services: mockServices,
      forceNewInstance: true,
      onBoot: {
        fn: () => {
          throw new Error("Boot failure");
        },
      },
    });

    await flushMicrotasks();
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
  });

  it("should log services table by default", () => {
    const tableSpy = vi.spyOn(console, "table").mockImplementation(() => {
      // intentional no-op for test
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {
      // suppress REST endpoint URL output
    });

    createNileServer({
      serverName: "Test",
      services: mockServices,
      forceNewInstance: true,
    });

    expect(tableSpy).toHaveBeenCalledTimes(1);
    expect(tableSpy.mock.calls[0]?.[0]).toEqual([
      {
        Service: "users",
        Description: "User management",
        Actions: 1,
      },
    ]);

    tableSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("should not log services table when logServices is false", () => {
    const tableSpy = vi.spyOn(console, "table").mockImplementation(() => {
      // intentional no-op for test
    });

    createNileServer({
      serverName: "Test",
      services: mockServices,
      forceNewInstance: true,
      logServices: false,
    });

    expect(tableSpy).not.toHaveBeenCalled();

    tableSpy.mockRestore();
  });
});

describe("createNileServer - Instance Management", () => {
  it("returns existing instance on second call without forceNewInstance", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {
      // intentional no-op for test
    });

    const server1 = createNileServer({
      serverName: "First",
      services: mockServices,
      forceNewInstance: true,
    });

    const server2 = createNileServer({
      serverName: "Second",
      services: mockServices,
    });

    expect(server1).toBe(server2);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("returning existing instance")
    );
    expect(server2.config.serverName).toBe("First");

    warnSpy.mockRestore();
  });

  it("creates new instance when forceNewInstance is true", () => {
    const server1 = createNileServer({
      serverName: "First",
      services: mockServices,
      forceNewInstance: true,
    });

    const server2 = createNileServer({
      serverName: "Second",
      services: mockServices,
      forceNewInstance: true,
    });

    expect(server1).not.toBe(server2);
    expect(server2.config.serverName).toBe("Second");
  });
});

describe("createNileServer - Resources", () => {
  it("should attach resources to the shared context", () => {
    const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

    const server = createNileServer({
      serverName: "Test",
      services: mockServices,
      forceNewInstance: true,
      resources: { logger: mockLogger },
    });

    expect(server.context.resources?.logger).toBe(mockLogger);
  });
});
