import { safeTry } from "slang-ts";
import { createEngine } from "@/engine/engine";
import type { Engine } from "@/engine/types";
import { createRestApp } from "@/rest/rest";
import { createDiagnosticsLog } from "@/utils";
import { createNileContext } from "./nile";
import type { NileContext, NileServer, Resources, ServerConfig } from "./types";

let _nileContext: NileContext | null = null;

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
export function getContext<TDB = unknown>(): NileContext<TDB> {
  if (!_nileContext) {
    throw new Error(
      "getContext: Server not initialized. Call createNileServer first."
    );
  }
  return _nileContext as NileContext<TDB>;
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
export function createNileServer(config: ServerConfig): NileServer {
  if (!config.services?.length) {
    throw new Error(
      "createNileServer requires at least one service in config.services"
    );
  }

  const log = createDiagnosticsLog("NileServer", {
    diagnostics: config.diagnostics,
    logger: config.resources?.logger as unknown as Parameters<
      typeof createDiagnosticsLog
    >[1]["logger"],
  });

  // Shared context -- created once with resources, passed to all layers
  const nileContext = createNileContext({
    resources: config.resources as unknown as Resources<unknown>,
  });

  _nileContext = nileContext as unknown as NileContext<unknown>;

  // Initialize the Action Engine
  const engine: Engine = createEngine({
    services: config.services,
    diagnostics: config.diagnostics,
    logger: config.resources?.logger as unknown as Parameters<
      typeof createEngine
    >[0]["logger"],
    onBeforeActionHandler: config.onBeforeActionHandler,
    onAfterActionHandler: config.onAfterActionHandler,
  });

  log(`Engine initialized with ${config.services.length} service(s)`);

  // Print registered services table (on by default, opt-out with logServices: false)
  if (config.logServices !== false) {
    const servicesResult = engine.getServices();
    if (servicesResult.isOk) {
      const table = servicesResult.value.map((s) => ({
        Service: s.name,
        Description: s.description,
        Actions: s.actions.length,
      }));
      console.table(table);
    }
  }

  // Build the server object incrementally
  const server: NileServer = {
    config,
    engine,
    context: nileContext as NileContext<unknown>,
  };

  // Initialize REST interface if configured
  if (config.rest) {
    const app = createRestApp({
      config: config.rest,
      engine,
      nileContext: nileContext as NileContext<unknown>,
      serverName: config.serverName,
      runtime: config.runtime ?? "bun",
    });

    server.rest = { app, config: config.rest };

    const host = config.rest.host ?? "localhost";
    const port = config.rest.port ?? 3000;
    const base = `http://${host}:${port}`;

    console.log(`\n  POST ${base}${config.rest.baseUrl}/services`);
    if (config.rest.enableStatus) {
      console.log(`  GET  ${base}/status`);
    }
    console.log("");
  }

  // Run onBoot lifecycle hook
  if (config.onBoot) {
    const { fn } = config.onBoot;
    // Fire-and-forget with crash safety via async IIFE
    const _boot = (async () => {
      const result = await safeTry(() => fn(nileContext));
      if (result.isErr) {
        console.error("[NileServer] onBoot failed:", result.error);
      }
    })();
    // Intentionally not awaited — boot runs in background
    _boot;
  }

  log(`${config.serverName} server ready`);

  return server;
}
