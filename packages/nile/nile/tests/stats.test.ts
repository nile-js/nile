import { Ok } from "slang-ts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEngine } from "../../engine/engine";
import type { Service } from "../../engine/types";
import { createNileServer } from "../server";
import { formatRegistrationDuration } from "../stats";

/** Build isolated registrations without starting a network listener. */
function createStatsService({
  name = "users",
  actionCount = 1,
  isHidden = false,
}: {
  name?: string;
  actionCount?: number;
  isHidden?: boolean;
} = {}): Service {
  return {
    name,
    description: `${name} service`,
    actions: Array.from({ length: actionCount }, (_, index) => ({
      name: `action-${index}`,
      description: `Action ${index}`,
      handler: () => Ok("done"),
      visibility: { rest: !isHidden },
    })),
  };
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "table").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("engine registration stats", () => {
  it("records empty engines and services without actions", () => {
    const empty = createEngine({ services: [] }).stats();
    expect(empty).toMatchObject({
      totalServices: 0,
      totalActions: 0,
      services: [],
    });
    expect(empty.registrationDurationMs).toBeGreaterThanOrEqual(0);
    const stats = createEngine({
      services: [createStatsService({ actionCount: 0 })],
    }).stats();
    expect(stats).toMatchObject({
      totalServices: 1,
      totalActions: 0,
      services: [
        { name: "users", description: "users service", actionCount: 0 },
      ],
    });
  });

  it("counts 300 registered actions including REST-hidden actions", () => {
    const engine = createEngine({
      services: Array.from({ length: 30 }, (_, index) =>
        createStatsService({
          name: `service-${index}`,
          actionCount: 10,
          isHidden: true,
        })
      ),
    });
    const stats = engine.stats();
    expect(stats.totalServices).toBe(30);
    expect(stats.totalActions).toBe(300);
    expect(stats.services).toHaveLength(30);
    expect(stats.services.every((service) => service.actionCount === 10)).toBe(
      true
    );
    expect(
      stats.services.every((service) => service.registrationDurationMs >= 0)
    ).toBe(true);
    expect(stats.registrationDurationMs).toBeGreaterThanOrEqual(0);
  });

  it("returns independent snapshots unaffected by configuration mutation", () => {
    const service = createStatsService();
    const services = [service];
    const engine = createEngine({ services });
    const original = engine.stats();
    const snapshot = engine.stats();
    expect(snapshot).toEqual(original);
    expect(snapshot).not.toBe(original);
    expect(snapshot.services).not.toBe(original.services);
    expect(snapshot.services[0]).not.toBe(original.services[0]);
    snapshot.totalActions = 500;
    const [snapshotService] = snapshot.services;
    if (!snapshotService) {
      throw new Error("Expected a registered service");
    }
    snapshotService.actionCount = 500;
    snapshot.services.push({
      name: "injected",
      description: "injected",
      actionCount: 500,
      registrationDurationMs: 500,
    });
    service.name = "changed";
    service.description = "changed";
    service.actions.push(...createStatsService({ name: "additional" }).actions);
    services.push(createStatsService({ name: "another" }));
    expect(engine.stats()).toEqual(original);
  });

  it("measures each registration within total initialization", () => {
    let time = 0;
    vi.spyOn(performance, "now").mockImplementation(() => time++);
    const stats = createEngine({
      services: [createStatsService(), createStatsService({ name: "posts" })],
    }).stats();
    expect(
      stats.services.map((service) => service.registrationDurationMs)
    ).toEqual([1, 1]);
    expect(stats.registrationDurationMs).toBe(5);
  });
});

describe("server startup stats", () => {
  it("includes awaited boot time without changing later measurements", async () => {
    vi.useFakeTimers();
    let time = 10;
    vi.spyOn(performance, "now").mockImplementation(() => time);
    const server = await createNileServer({
      serverName: "Stats",
      services: [createStatsService()],
      forceNewInstance: true,
      logServices: false,
      onBoot: {
        fn: async () => {
          await Promise.resolve();
          time = 1210;
          return Ok(null);
        },
      },
    });
    const original = server.stats();
    expect(original.startupDurationMs).toBe(1200);
    expect(original.registrationDurationMs).toBe(0);
    expect(original.totalActions).toBe(1);
    time = 9000;
    const snapshot = server.stats();
    const [snapshotService] = snapshot.services;
    if (!snapshotService) {
      throw new Error("Expected a registered service");
    }
    snapshotService.name = "changed";
    snapshot.startupDurationMs = 0;
    expect(server.stats()).toEqual(original);
  });

  it("prints default totals and formatted per-service registration", async () => {
    let time = 0;
    vi.spyOn(performance, "now").mockImplementation(() => time++);
    const server = await createNileServer({
      serverName: "Stats",
      services: [createStatsService({ actionCount: 2 })],
      forceNewInstance: true,
    });
    expect(console.table).toHaveBeenCalledExactlyOnceWith([
      {
        Service: "users",
        Description: "users service",
        Actions: 2,
        Registration: "1.000ms",
      },
    ]);
    expect(console.log).toHaveBeenCalledWith(
      "Registered 1 service and 2 actions in 3.000ms"
    );
    expect(server.stats().startupDurationMs).toBeGreaterThanOrEqual(0);
    const logCalls = vi.mocked(console.log).mock.calls.length;
    server.stats();
    expect(vi.mocked(console.log).mock.calls).toHaveLength(logCalls);
    expect(console.table).toHaveBeenCalledTimes(1);
  });

  it("keeps stats available when startup registration output is disabled", async () => {
    const server = await createNileServer({
      serverName: "Stats",
      services: [createStatsService()],
      forceNewInstance: true,
      logServices: false,
    });
    expect(server.stats().totalServices).toBe(1);
    expect(console.table).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalledWith(
      expect.stringContaining("Registered ")
    );
  });

  it("retains singleton measurements and separates forced instances", async () => {
    const first = await createNileServer({
      serverName: "First",
      services: [createStatsService()],
      forceNewInstance: true,
      logServices: false,
    });
    const original = first.stats();
    const reused = await createNileServer({
      serverName: "Ignored",
      services: [createStatsService({ actionCount: 100 })],
    });
    expect(reused).toBe(first);
    expect(reused.stats()).toEqual(original);
    const forced = await createNileServer({
      serverName: "Second",
      services: [createStatsService({ actionCount: 2 })],
      forceNewInstance: true,
      logServices: false,
    });
    expect(forced).not.toBe(first);
    expect(forced.stats().totalActions).toBe(2);
    expect(first.stats()).toEqual(original);
  });
});

it("formats registration durations using milliseconds or seconds", () => {
  expect(formatRegistrationDuration(0.123_45)).toBe("0.123ms");
  expect(formatRegistrationDuration(1500)).toBe("1.5s");
});
