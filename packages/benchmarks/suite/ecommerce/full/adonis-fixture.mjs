import { createServer } from "node:http";
import { Ignitor } from "@adonisjs/core";
import { listenNode, setCors } from "./node-shared.mjs";

/** Boot Adonis's real provider, router, body parser and HTTP context without application env loading. */
export async function createAdonisFixture(base) {
  const app = new Ignitor(new URL("./adonis/", import.meta.url)).createApp(
    "web",
  );
  await app.init();
  await app.boot();
  const server = await app.container.make("server");
  await app.start(async () => {
    const router = await app.container.make("router");
    router.route("*", ["OPTIONS"], ({ response }) =>
      response.status(204).send(null),
    );
    base.definitions.forEach((definition) => {
      router.post(definition.path, async ({ request, response }) => {
        const result = await base.execute(
          definition,
          request.body(),
          request.headers(),
        );
        return response.status(result.status).send(result.body);
      });
    });
    server.use([
      () => Promise.resolve({
        default: class CorsMiddleware {
          handle({ request, response }, next) {
            const preflight = request.method() === "OPTIONS";
            setCors(
              request.headers(),
              (key, value) => response.header(key, value),
              preflight,
            );
            if (preflight) { return response.status(204).send(null); }
            return next();
          }
        },
      }),
      () => import("@adonisjs/core/bodyparser_middleware"),
    ]);
    await server.boot();
  });
  const nodeServer = createServer(server.handle.bind(server));
  server.setNodeServer(nodeServer);
  return {
    ...base,
    start: () => listenNode(nodeServer, () => app.terminate()),
  };
}
