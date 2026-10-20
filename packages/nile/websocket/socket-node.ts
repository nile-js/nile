import type { Server as NodeServer } from "node:http";
import type { Server } from "socket.io";

/** Attach/detach Socket.IO while leaving ownership of the existing HTTP listener with the app. */
export function createNodeSocketAttachment(
  io: Server,
  path: string,
  isBun: boolean
) {
  let detach: (() => void) | undefined;
  return {
    detach: () => detach?.(),
    attachNode(server: NodeServer) {
      if (isBun) {
        throw new Error("Use the Bun socket handler for a Bun server");
      }
      if (detach) {
        throw new Error("Socket adapter already attached");
      }
      const requests = server.listeners("request");
      const upgrades = server.listeners("upgrade");
      const closes = server.listeners("close");
      io.attach(server, { path });
      const addedRequests = server
        .listeners("request")
        .filter((listener) => !requests.includes(listener));
      const addedUpgrades = server
        .listeners("upgrade")
        .filter((listener) => !upgrades.includes(listener));
      const addedCloses = server
        .listeners("close")
        .filter((listener) => !closes.includes(listener));
      detach = () => {
        for (const listener of addedRequests) {
          server.off("request", listener);
        }
        for (const listener of addedUpgrades) {
          server.off("upgrade", listener);
        }
        for (const listener of addedCloses) {
          server.off("close", listener);
        }
        for (const listener of requests) {
          if (!server.listeners("request").includes(listener)) {
            server.on("request", listener);
          }
        }
      };
      return Promise.resolve(async () => {
        io.disconnectSockets(true);
        io.engine.close();
        await io.sockets.adapter.close();
        detach?.();
      });
    },
  };
}
