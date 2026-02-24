import { safeTry } from "slang-ts";
import { createEngine } from "@/engine/engine";
import type { Engine } from "@/engine/types";
import { createRestApp } from "@/rest/rest";
import { createNileContext } from "./nile";
import type { NileServer, ServerConfig } from "./types";

/**
 * Creates a Nile server instance that wires together the Action Engine,
 * shared NileContext, and interface layers (REST, and later WS/RPC).
 *
 * The NileContext is created once here and shared across all interfaces.
 */
export function createNileServer(config: ServerConfig): NileServer {
  if (!config.services?.length) {
    throw new Error(
      "createNileServer requires at least one service in config.services"
    );
  }

  const log = (message: string, data?: unknown) => {
    if (!config.diagnostics) {
      return;
    }

    const logger = config.resources?.logger as
      | { info: (msg: string, data?: unknown) => void }
      | undefined;

    if (logger?.info) {
      logger.info(`[NileServer] ${message}`, data);
    } else {
      console.log(`[NileServer] ${message}`, data ?? "");
    }
  };

  // Shared context -- created once with resources, passed to all layers
  const nileContext = createNileContext({
    resources: config.resources,
  });

  // Initialize the Action Engine
  const engine: Engine = createEngine({
    services: config.services,
    diagnostics: config.diagnostics,
    onBeforeActionHandler: config.onBeforeActionHandler,
    onAfterActionHandler: config.onAfterActionHandler,
  });

  log(`Engine initialized with ${config.services.length} service(s)`);

  // Build the server object incrementally
  const server: NileServer = {
    config,
    engine,
    context: nileContext,
  };

  // Initialize REST interface if configured
  if (config.rest) {
    const app = createRestApp({
      config: config.rest,
      engine,
      nileContext,
      serverName: config.serverName,
      runtime: config.runtime ?? "bun",
    });

    server.rest = { app, config: config.rest };
    log(`REST interface mounted at ${config.rest.baseUrl}/services`);
  }

  // Run onBoot lifecycle hook
  if (config.onBoot) {
    const { fn, logServices } = config.onBoot;

    if (logServices) {
      const servicesResult = engine.getServices();
      if (servicesResult.isOk) {
        log("Registered services:", servicesResult.value);
      }
    }

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
