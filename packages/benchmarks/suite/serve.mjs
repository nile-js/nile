import { createServer } from "node:http";
import { once } from "node:events";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { readConfig } from "./shared/config.mjs";

const config = readConfig();
if (config.nodeEnvironment !== "production")
  throw new Error("Set NODE_ENV=production when starting benchmark fixtures");
const started = performance.now();
if (config.runtime === "bun" && !process.versions.bun)
  throw new Error("Run the Bun track with the Bun executable");
if (config.runtime === "node" && process.versions.bun)
  throw new Error("Run the Node track with the Node executable");
if (
  config.runtime === "bun" &&
  !["nile", "nile-release", "elysia", "effect"].includes(config.framework)
)
  throw new Error(
    "This launcher supports Bun for Nile, Elysia and Effect; other Node fixtures stay in the Node track"
  );

/** Publish readiness only after native initialization and listener acquisition. */
function reportReady() {
  console.log(
    `BENCHMARK_READY ${JSON.stringify({
      ...config,
      runtimeVersion: process.versions.bun ?? process.versions.node,
      pid: process.pid,
      factoryAndListenMs: performance.now() - started,
      processReadyMs: process.uptime() * 1000,
      memory: process.memoryUsage(),
    })}`
  );
}

/** Record process lifetime resources separately from per-request timings. */
function reportTelemetry() {
  console.log(
    `BENCHMARK_TELEMETRY ${JSON.stringify({
      ...config,
      pid: process.pid,
      uptimeSeconds: process.uptime(),
      cpu: process.cpuUsage(),
      resources: process.resourceUsage(),
      memory: process.memoryUsage(),
    })}`
  );
}
process.once("SIGINT", reportTelemetry);
process.once("SIGTERM", reportTelemetry);

/** Wait for the owner's requested listener and fail immediately on bind errors. */
async function listen(server) {
  const listening = once(server, "listening");
  server.listen(config.port, "127.0.0.1");
  await listening;
  return server;
}

/** Initialize the selected framework through its public server adapter. */
async function startFixture() {
  if (config.framework === "effect") {
    const isBun = config.runtime === "bun";
    const [adapter, runtime, { Layer }] = await Promise.all([
      import(isBun ? "./adapters/effect-bun.mjs" : "./adapters/effect.mjs"),
      import(isBun ? "@effect/platform-bun" : "@effect/platform-node"),
      import("effect"),
    ]);
    const createLayer = isBun
      ? adapter.createEffectBunServerLayer
      : adapter.createEffectServerLayer;
    const runMain = isBun
      ? runtime.BunRuntime.runMain
      : runtime.NodeRuntime.runMain;
    runMain(Layer.launch(createLayer({ ...config, onReady: reportReady })));
    return null;
  }
  if (config.framework.startsWith("nile")) {
    const { createNile } = await import("./adapters/nile.mjs");
    const app = await createNile({
      ...config,
      released: config.framework === "nile-release",
    });
    if (config.runtime === "bun") {
      const server = Bun.serve({
        fetch: app.rest.app.fetch,
        hostname: "127.0.0.1",
        port: config.port,
      });
      return () => server.stop(true);
    }
    const adapterPath =
      config.framework === "nile-release"
        ? pathToFileURL(
            createRequire(import.meta.url).resolve("@hono/node-server", {
              paths: [
                dirname(createRequire(import.meta.url).resolve("nile-release")),
              ],
            })
          ).href
        : new URL(
            "../../nile/node_modules/@hono/node-server/dist/index.mjs",
            import.meta.url
          ).href;
    const { createAdaptorServer } = await import(adapterPath);
    const server = createAdaptorServer({ fetch: app.rest.app.fetch });
    await listen(server);
    return () => server.close();
  }
  if (config.framework === "express") {
    const { createExpress } = await import("./adapters/express.mjs");
    const server = await listen(createServer(createExpress(config)));
    return () => server.close();
  }
  if (config.framework === "fastify") {
    const { createFastify } = await import("./adapters/fastify.mjs");
    const app = await createFastify(config);
    await app.listen({ host: "127.0.0.1", port: config.port });
    return () => app.close();
  }
  if (config.framework === "elysia") {
    const { createElysia } = await import("./adapters/elysia.mjs");
    const app = createElysia(config);
    const ready = Promise.withResolvers();
    app.listen({ port: config.port, hostname: "127.0.0.1" }, () =>
      ready.resolve()
    );
    await ready.promise;
    return () => app.stop();
  }
  if (config.framework === "trpc") {
    const { createTrpc } = await import("./adapters/trpc.mjs");
    const { server } = createTrpc(config);
    await listen(server);
    return () => server.close();
  }
  if (config.framework.startsWith("nest-")) {
    const { createNest } = await import("./compiled/nest.js");
    const app = await createNest({
      mode: config.mode,
      host: config.framework.slice(5),
    });
    await app.listen(config.port, "127.0.0.1");
    return () => app.close();
  }
  const { createAdonis } = await import("./compiled/adonis.js");
  const app = await createAdonis(config);
  await listen(app.nodeServer);
  return async () => {
    app.nodeServer.close();
    await app.close();
  };
}

// This entry point binds sockets only when explicitly run by the owner.
const close = await startFixture();
if (close) {
  reportReady();
  const shutdown = async () => {
    await close();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
