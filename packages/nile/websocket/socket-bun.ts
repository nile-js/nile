import type { Server as BunEngine } from "@socket.io/bun-engine";
import type { NileSocket } from "./socket-types";

/** Adapt Bun's real socket/server objects behind a structural, Node-safe public type boundary. */
export function createBunSocketInterface(
  engine: BunEngine | undefined,
  limits: { bytes: number; buffered: number }
): Pick<NileSocket, "bun" | "handleRequest"> {
  return {
    bun: engine
      ? {
          open: (socket) =>
            engine.onWebSocketOpen(
              socket as Parameters<BunEngine["onWebSocketOpen"]>[0]
            ),
          message: (socket, message) =>
            engine.onWebSocketMessage(
              socket as Parameters<BunEngine["onWebSocketMessage"]>[0],
              message
            ),
          close: (socket, code, reason) =>
            engine.onWebSocketClose(
              socket as Parameters<BunEngine["onWebSocketClose"]>[0],
              code,
              reason
            ),
          maxPayloadLength: limits.bytes,
          backpressureLimit: limits.buffered,
          closeOnBackpressureLimit: true,
        }
      : undefined,
    handleRequest: (request, server) =>
      engine
        ? engine.handleRequest(
            request,
            server as Parameters<BunEngine["handleRequest"]>[1]
          )
        : Promise.resolve(
            new Response("Bun adapter disabled", { status: 426 })
          ),
  };
}
