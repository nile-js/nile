import { safeTry } from "slang-ts";
import { createEngine } from "@/engine/engine";
import type { Engine } from "@/engine/types";
import { createDiagnosticsLog } from "@/utils";
import { createInvoker } from "../execution/invoke";
import { createExecutionRuntime } from "../execution/runtime";
import { createLifecycle } from "../lifecycle/lifecycle";
import { enforceProjectStructure } from "../project/check-structure";
import { createNileContext } from "./nile";
import { getRequestStore } from "./request-scope";
import { attachSchedules } from "./schedules";
import { createSchemaExporter } from "./schema";
import { printStartupStats } from "./stats";
import { createServerTransports } from "./transports";
import type { NileContext, NileServer, Resources, ServerConfig } from "./types";

type TopicServerConfig<
  T extends import("../messaging/types").TopicDefinitions,
  C = ServerConfig,
> = C extends ServerConfig
  ? Omit<C, "websocket"> & {
      websocket: import("../websocket/socket-types").SocketConfig<T>;
    }
  : never;

let _nileContext: NileContext | null = null;
let _nileServer: NileServer | null = null;

/**
 * Retrieves the runtime NileContext.
 *
 * Use this to access shared resources (database, logger) and context storage
 * from anywhere in your application. Supports a TDB generic to provide
 * end-to-end type safety for your database instance.
 *
 * @template TDB - The type of your database instance (e.g. typeof db)
 * @returns The active NileContext<TDB>
 * @throws If called before createNileServer has initialized the global context.
 */
export function getContext<
  const T extends import("../messaging/types").TopicDefinitions,
>(options: {
  topics: T;
}): Omit<NileContext, "websocket"> & {
  websocket: import("../websocket/socket-types").NileSocket<T>;
};
export function getContext<TDB = unknown>(): NileContext<TDB>;
export function getContext(options?: {
  topics: import("../messaging/types").TopicDefinitions;
}): NileContext {
  const context = getRequestStore()?.context ?? _nileContext;
  if (!context) {
    throw new Error(
      "getContext: Server not initialized. Call createNileServer first."
    );
  }
  if (
    options &&
    (!context.websocket ||
      context.get("nile:websocket:topics") !== options.topics)
  ) {
    throw new Error(
      "Topic definitions do not belong to the active Nile instance"
    );
  }
  return context;
}

/**
 * Bootstraps a Nile server instance.
 *
 * Wires together the Action Engine, shared NileContext, and interface layers (REST).
 * This is the primary entry point for a Nile application. It handles service
 * registration, resource attachment, and server lifecycle.
 *
 * @param config - Server configuration including services, rest options, and resources
 * @returns A NileServer instance containing the engine and (optional) REST app
 */
export function createNileServer<
  const T extends import("../messaging/types").TopicDefinitions,
>(
  config: TopicServerConfig<T>
): Promise<
  Omit<NileServer, "websocket" | "context"> & {
    context: Omit<NileContext, "websocket"> & {
      websocket: import("../websocket/socket-types").NileSocket<T>;
    };
    websocket: import("../websocket/socket-types").NileSocket<T>;
  }
>;
export function createNileServer(config: ServerConfig): Promise<NileServer>;
export async function createNileServer(
  config: ServerConfig
): Promise<NileServer> {
  const startTime = performance.now();

  // Return existing instance unless explicitly forced to create new
  if (
    _nileServer &&
    _nileServer.lifecycle.state() !== "stopped" &&
    !config.forceNewInstance
  ) {
    console.warn(
      "[NileServer] createNileServer called again — returning existing instance. Use forceNewInstance: true to override."
    );
    return _nileServer;
  }

  if (!config.services?.length) {
    throw new Error(
      "createNileServer requires at least one service in config.services"
    );
  }

  await enforceProjectStructure(config.project);

  const log = createDiagnosticsLog("NileServer", {
    diagnostics: config.diagnostics,
    logger: config.resources?.logger as unknown as Parameters<
      typeof createDiagnosticsLog
    >[1]["logger"],
  });

  if (config.native && config.runtime !== "bun") {
    throw new Error('Bun native requires runtime: "bun"');
  }

  // Shared context -- created once with resources, passed to all layers
  const nileContext = createNileContext({
    resources: config.resources as unknown as Resources<unknown>,
  });

  _nileContext = nileContext as unknown as NileContext<unknown>;

  const lifecycle = createLifecycle();
  for (const resource of config.cleanup ?? []) {
    lifecycle.register(resource);
  }
  const execution = createExecutionRuntime({
    lifecycle,
    context: nileContext,
    options: config.execution,
  });

  const initialized = await safeTry(async () => {
    // Initialize the Action Engine
    const engine: Engine = createEngine({
      services: config.services,
      execute: execution.execute,
      checkQuota: execution.checkQuota,
      diagnostics: config.diagnostics,
      logger: config.resources?.logger as unknown as Parameters<
        typeof createEngine
      >[0]["logger"],
      auth: config.auth,
      onBeforeActionHandler: config.onBeforeActionHandler,
      onAfterActionHandler: config.onAfterActionHandler,
    });

    log(`Engine initialized with ${config.services.length} service(s)`);

    // Print registered services table (on by default, opt-out with logServices: false)
    if (config.logServices !== false) {
      printStartupStats(engine.stats());
    }

    // Run onBoot lifecycle hook — await before proceeding
    if (config.onBoot) {
      const { fn, maxWaitTime = 10_000 } = config.onBoot;
      const bootStart = performance.now();

      const boot = async () => {
        const result = await safeTry(() => fn(nileContext));
        if (result.isErr) {
          throw new Error(`onBoot failed: ${result.error}`);
        }
      };

      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`onBoot timed out after ${maxWaitTime}ms`)),
          maxWaitTime
        );
      });
      const bootResult = await safeTry(() => Promise.race([boot(), timeout]));
      if (timer) {
        clearTimeout(timer);
      }
      if (bootResult.isErr) {
        await lifecycle.shutdown();
        throw new Error(`Nile startup failed: ${bootResult.error}`);
      }
      console.log(`Booted in ${(performance.now() - bootStart).toFixed(1)}ms`);
    }

    // Build the server object — always booted at this point
    let startupDurationMs = 0;
    const server: NileServer = {
      schema: createSchemaExporter(engine),
      invoke: createInvoker(engine, nileContext, config.rpc?.enabled !== false),
      lifecycle,
      ...(await createServerTransports({
        config,
        engine,
        lifecycle,
        context: nileContext,
      })),
      stats: () => ({ ...engine.stats(), startupDurationMs }),
      config,
      engine,
      context: nileContext as NileContext<unknown>,
    };

    server.schema = createSchemaExporter(engine, server.websocket);
    attachSchedules(server, config.schedules, execution);
    lifecycle.ready();
    server.scheduler?.start();

    const elapsed = performance.now() - startTime;
    startupDurationMs = elapsed;
    const readyTime =
      elapsed >= 1000
        ? `${(elapsed / 1000).toFixed(1)}s`
        : `${elapsed.toFixed(1)}ms`;
    console.log(`\n${config.serverName} server ready in ${readyTime}`);

    _nileServer = server;
    return server;
  });
  if (initialized.isErr) {
    await lifecycle.shutdown();
    _nileContext = _nileServer?.context ?? null;
    throw new Error(`Nile initialization failed: ${initialized.error}`);
  }
  return initialized.value;
}
