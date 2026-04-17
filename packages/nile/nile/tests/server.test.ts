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

const bootedInPattern = /Booted in \d+\.\d+ms/;
const timedOutPattern = /timed out after 50ms/;

describe("createNileServer - Initialization", () => {
  it("should throw if no services provided", async () => {
    await expect(
      createNileServer({
        serverName: "Test",
        services: [],
        forceNewInstance: true,
      })
    ).rejects.toThrow("at least one service");
  });

  it("should throw if services is undefined", async () => {
    // Type assertion to bypass compile-time check — testing runtime guard
    await expect(
      createNileServer({
        serverName: "Test",
        forceNewInstance: true,
      } as Parameters<typeof createNileServer>[0])
    ).rejects.toThrow("at least one service");
  });

  it("should return a NileServer with engine and context", async () => {
    const server = await createNileServer({
      serverName: "Test",
      services: mockServices,
      forceNewInstance: true,
    });

    expect(server.engine).toBeDefined();
    expect(server.context).toBeDefined();
    expect(server.config.serverName).toBe("Test");
  });

  it("should not have rest property when rest config is absent", async () => {
    const server = await createNileServer({
      serverName: "Test",
      services: mockServices,
      forceNewInstance: true,
    });

    expect(server.rest).toBeUndefined();
  });
});

describe("createNileServer - REST Interface", () => {
  it("should create rest.app when rest config is provided", async () => {
    const server = await createNileServer({
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
    const server = await createNileServer({
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

describe("createNileServer - onBoot", () => {
  it("should run onBoot callback", async () => {
    const bootFn = vi.fn();

    await createNileServer({
      serverName: "Test",
      services: mockServices,
      forceNewInstance: true,
      onBoot: { fn: bootFn },
    });

    expect(bootFn).toHaveBeenCalledTimes(1);
  });

  it("should pass nileContext to onBoot callback", async () => {
    let receivedContext: unknown = null;

    await createNileServer({
      serverName: "Test",
      services: mockServices,
      forceNewInstance: true,
      onBoot: {
        fn: (ctx) => {
          receivedContext = ctx;
        },
      },
    });

    expect(receivedContext).not.toBeNull();

    const ctx = receivedContext as { _store: Map<string, unknown> };
    expect(ctx._store).toBeInstanceOf(Map);
  });

  it("should have rest defined after boot completes", async () => {
    const server = await createNileServer({
      serverName: "Test",
      services: mockServices,
      forceNewInstance: true,
      rest: { baseUrl: "/api", allowedOrigins: ["*"], enableStatus: false },
      onBoot: {
        fn: async () => {
          await new Promise((r) => setTimeout(r, 5));
        },
      },
    });

    expect(server.rest).toBeDefined();
  });

  it("should log boot timing after success", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {
      // intentional no-op for test
    });

    await createNileServer({
      serverName: "Test",
      services: mockServices,
      forceNewInstance: true,
      diagnostics: true,
      onBoot: {
        fn: () => {
          /* intentional no-op */
        },
      },
    });

    const allLogs = logSpy.mock.calls.flat().join(" ");
    expect(allLogs).toMatch(bootedInPattern);

    logSpy.mockRestore();
  });

  it("should exit process when onBoot fails", async () => {
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);

    await createNileServer({
      serverName: "Test",
      services: mockServices,
      forceNewInstance: true,
      onBoot: {
        fn: () => {
          throw new Error("Boot failure");
        },
      },
    });

    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
  });

  it("should exit process when onBoot times out", async () => {
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {
      // intentional no-op for test
    });

    await createNileServer({
      serverName: "Test",
      services: mockServices,
      forceNewInstance: true,
      diagnostics: true,
      onBoot: {
        fn: async () => {
          await new Promise((r) => setTimeout(r, 500));
        },
        maxWaitTime: 50,
      },
    });

    expect(exitSpy).toHaveBeenCalledWith(1);

    const allLogs = logSpy.mock.calls.flat().join(" ");
    expect(allLogs).toMatch(timedOutPattern);

    exitSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("should log services table by default", async () => {
    const tableSpy = vi.spyOn(console, "table").mockImplementation(() => {
      // intentional no-op for test
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {
      // suppress REST endpoint URL output
    });

    await createNileServer({
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

  it("should not log services table when logServices is false", async () => {
    const tableSpy = vi.spyOn(console, "table").mockImplementation(() => {
      // intentional no-op for test
    });

    await createNileServer({
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
  it("returns existing instance on second call without forceNewInstance", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {
      // intentional no-op for test
    });

    const server1 = await createNileServer({
      serverName: "First",
      services: mockServices,
      forceNewInstance: true,
    });

    const server2 = await createNileServer({
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

  it("creates new instance when forceNewInstance is true", async () => {
    const server1 = await createNileServer({
      serverName: "First",
      services: mockServices,
      forceNewInstance: true,
    });

    const server2 = await createNileServer({
      serverName: "Second",
      services: mockServices,
      forceNewInstance: true,
    });

    expect(server1).not.toBe(server2);
    expect(server2.config.serverName).toBe("Second");
  });
});

describe("createNileServer - Resources", () => {
  it("should attach resources to the shared context", async () => {
    const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

    const server = await createNileServer({
      serverName: "Test",
      services: mockServices,
      forceNewInstance: true,
      resources: { logger: mockLogger },
    });

    expect(server.context.resources?.logger).toBe(mockLogger);
  });
});
