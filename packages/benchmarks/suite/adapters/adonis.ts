import { createServer } from "node:http";
import { Ignitor } from "@adonisjs/core";
import { registerRoutes } from "./adonis/routes.js";

/** Boot core Adonis providers and its HTTP pipeline without listening. */
export async function createAdonis({ mode }: { mode: "plain" | "validated" }) {
  const app = new Ignitor(new URL("./adonis/", import.meta.url)).createApp(
    "web"
  );
  await app.init();
  await app.boot();

  const server = await app.container.make("server");
  await app.start(async () => {
    const router = await app.container.make("router");
    registerRoutes({ router, mode });
    server.use([() => import("@adonisjs/core/bodyparser_middleware")]);
    await server.boot();
  });

  const nodeServer = createServer(server.handle.bind(server));
  server.setNodeServer(nodeServer);
  return { app, server, nodeServer, close: () => app.terminate() };
}
