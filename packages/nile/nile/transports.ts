import type { Engine } from "../engine/types";
import type { NileLifecycle } from "../lifecycle/types";
import { createNativeRestApp } from "../native/rest";
import { createRestApp } from "../rest/rest";
import type { NileContext, NileServer, ServerConfig } from "./types";

const TRAILING_SLASH = /\/$/;

/** Assemble optional interfaces while keeping one engine and explicit listener ownership. */
export async function createServerTransports({
  config,
  engine,
  lifecycle,
  context,
}: {
  config: ServerConfig;
  engine: Engine;
  lifecycle: NileLifecycle;
  context: NileContext;
}): Promise<Pick<NileServer, "fetch" | "rest" | "nativeRest" | "websocket">> {
  const clientAddresses = new WeakMap<Request, string>();
  const configureRest = <T extends NonNullable<ServerConfig["rest"]>>(
    rest: T
  ): T => ({
    ...rest,
    protection: {
      ...rest.protection,
      getClientAddress:
        rest.protection?.getClientAddress ??
        ((request: Request) => clientAddresses.get(request)),
    },
  });
  let rest: NileServer["rest"];
  let nativeRest: NileServer["nativeRest"];
  if (config.rest && !config.native) {
    const app = createRestApp({
      config: configureRest(config.rest),
      engine,
      lifecycle,
      nileContext: context,
      serverName: config.serverName,
      runtime: config.runtime ?? "bun",
    });
    rest = {
      app: app.app,
      config: config.rest,
      addMiddleware: app.addMiddleware,
    };
    console.log(
      `\n  POST http://${config.rest.host ?? "localhost"}:${config.rest.port ?? 8000}${config.rest.baseUrl}/services\n`
    );
  }
  if (config.native && config.rest) {
    nativeRest = createNativeRestApp({
      config: configureRest(config.rest),
      engine,
      lifecycle,
      nileContext: context,
      services: config.services,
      serverName: config.serverName,
    });
  }
  const websocket = config.websocket
    ? await (
        await import("../websocket/socket-transport")
      ).createSocketTransport({
        runtime: config.runtime ?? "bun",
        engine,
        context,
        lifecycle,
        config: config.websocket,
      })
    : undefined;
  context.websocket = websocket;
  if (config.websocket?.topics) {
    context.set("nile:websocket:topics", config.websocket.topics);
  }
  return {
    rest,
    nativeRest,
    websocket,
    fetch(request, listener) {
      const address = listener?.requestIP(request)?.address;
      if (address) {
        clientAddresses.set(request, address);
      }
      if (
        websocket &&
        new URL(request.url).pathname.replace(TRAILING_SLASH, "") ===
          websocket.path.replace(TRAILING_SLASH, "")
      ) {
        if (listener) {
          return websocket.handleRequest(request, listener);
        }
        return Promise.resolve(
          Response.json(
            {
              status: false,
              message: "WebSocket requests require the runtime upgrade adapter",
              data: {},
            },
            { status: 426 }
          )
        );
      }
      if (nativeRest) {
        return Promise.resolve(nativeRest.fetch(request));
      }
      if (rest) {
        return Promise.resolve(rest.app.fetch(request));
      }
      return Promise.resolve(
        Response.json(
          { status: false, message: "HTTP interface is disabled", data: {} },
          { status: 404 }
        )
      );
    },
  };
}
