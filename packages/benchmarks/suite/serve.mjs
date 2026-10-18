import { createServer } from "node:http";
import { once } from "node:events";
import { readConfig } from "./shared/config.mjs";
import { createWorkload } from "./shared/workload-store.mjs";

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
  !["nile", "elysia", "effect", "hono", "bun"].includes(config.framework)
)
  throw new Error(
    "This launcher supports Bun for Nile, Elysia and Effect; other Node fixtures stay in the Node track"
  );

const workload = await createWorkload(config);
const fixtureConfig = { ...config, execute: workload.execute };
process.once("exit", () => workload.close());

/** Publish readiness only after native initialization and listener acquisition. */
function reportReady() {
  console.log(
    `BENCHMARK_READY ${JSON.stringify({
      ...config,
      workloadMetadata: workload.metadata,
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
      workloadMetadata: workload.metadata,
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
    runMain(
      Layer.launch(createLayer({ ...fixtureConfig, onReady: reportReady }))
    );
    return null;
  }
  if (config.framework === "nile") {
    const { createNile } = await import("./adapters/nile.mjs");
    const app = await createNile(fixtureConfig);
    if (config.runtime === "bun") {
      const server = Bun.serve({
        fetch: app.rest.app.fetch,
        hostname: "127.0.0.1",
        port: config.port,
      });
      return () => server.stop(true);
    }
    const adapterPath = new URL(
      "../../nile/node_modules/@hono/node-server/dist/index.mjs",
      import.meta.url
    ).href;
    const { createAdaptorServer } = await import(adapterPath);
    const server = createAdaptorServer({ fetch: app.rest.app.fetch });
    await listen(server);
    return () => server.close();
  }
  if (config.framework === "hono" || config.framework === "bun") {
    const fetch =
      config.framework === "hono"
        ? (await import("./adapters/hono.mjs")).createHono(fixtureConfig).fetch
        : (await import("./adapters/bun.mjs")).createBunHandler(fixtureConfig);
    if (config.runtime === "bun") {
      const server = Bun.serve({
        fetch,
        hostname: "127.0.0.1",
        port: config.port,
      });
      return () => server.stop(true);
    }
    const { createAdaptorServer } = await import("@hono/node-server");
    const server = createAdaptorServer({ fetch });
    await listen(server);
    return () => server.close();
  }
  if (config.framework === "express") {
    const { createExpress } = await import("./adapters/express.mjs");
    const server = await listen(createServer(createExpress(fixtureConfig)));
    return () => server.close();
  }
  if (config.framework === "fastify") {
    const { createFastify } = await import("./adapters/fastify.mjs");
    const app = await createFastify(fixtureConfig);
    await app.listen({ host: "127.0.0.1", port: config.port });
    return () => app.close();
  }
  if (config.framework === "elysia") {
    const { createElysia } = await import("./adapters/elysia.mjs");
    const app = createElysia(fixtureConfig);
    const ready = Promise.withResolvers();
    app.listen(
      { port: config.port, hostname: "127.0.0.1", reusePort: false },
      (server) => ready.resolve(server)
    );
    const server = await ready.promise;
    // The Node adapter calls back before srvx binds its socket and does not set
    // app.server. Await the native listener, then retain its actual close handle.
    if (config.runtime === "node") await server.raw.ready();
    return () => server.stop();
  }
  if (config.framework === "trpc") {
    const { createTrpc } = await import("./adapters/trpc.mjs");
    const { server } = createTrpc(fixtureConfig);
    await listen(server);
    return () => server.close();
  }
  if (config.framework.startsWith("nest-")) {
    const { createNest } = await import("./compiled/nest.js");
    const app = await createNest({
      mode: config.mode,
      execute: workload.execute,
      host: config.framework.slice(5),
    });
    await app.listen(config.port, "127.0.0.1");
    return () => app.close();
  }
  const { createAdonis } = await import("./compiled/adonis.js");
  const app = await createAdonis(fixtureConfig);
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
