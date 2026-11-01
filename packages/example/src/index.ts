import { createLogger, createNileServer, utils } from "@nilejs/nile";
import { sql } from "drizzle-orm";
import { Ok, safeTry } from "@nilejs/nile/fp";
import { db, pglite } from "@/db/client";
import { services } from "@/services/services.config";

const logger = createLogger("task-app", {
  mode: "dev",
  chunking: "monthly",
});

/** Push schema to PGLite on boot */
const pushSchema = async () => {
  const result = await safeTry(() =>
    db.execute(sql`
      CREATE TABLE IF NOT EXISTS tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)
  );

  if (result.isErr) {
    return utils.handleError({
      message: "Could not prepare the task database.",
      data: utils.describeError(result.raw),
      atFunction: "pushSchema",
      logger: logger,
    });
  }

  return Ok(null);
};

const server = await createNileServer({
  serverName: "task-app",
  runtime: "bun",
  native: true,
  project: { root: process.cwd(), structure: "error" },
  services,
  resources: { logger, database: db },
  rest: {
    baseUrl: "/api",
    host: "localhost",
    port: 8000,
    allowedOrigins: ["http://localhost:8000"],
    enableStatus: true,
    discovery: { enabled: true },
  },
  onBoot: {
    // The first PGlite start on a slow machine can take longer than the 10 second default.
    maxWaitTime: 30_000,
    fn: async (ctx) => {
      const prepared = await pushSchema();
      if (prepared.isErr) {
        return prepared;
      }
      ctx.resources?.logger?.info({
        atFunction: "onBoot",
        message: "task-app booted - PGLite schema ready",
      });
      return Ok(null);
    },
  },
});

// Register custom middleware (runs before all service requests)
server.nativeRest?.addMiddleware("/api", async (c, next) => {
  const start = performance.now();
  await next();
  const ms = (performance.now() - start).toFixed(1);
  logger.info({
    atFunction: "requestLog",
    message: `${c.request.method} ${c.path} - ${ms}ms`,
  });
  return undefined;
});

if (server.nativeRest) {
  const port = server.config.rest?.port ?? 8000;
  const listener = Bun.serve({
    port: port,
    fetch: server.nativeRest.fetch,
  });
  let closing = false;
  const shutdown = async () => {
    if (closing) {
      return;
    }
    closing = true;
    listener.stop();
    await server.lifecycle.shutdown();
    await pglite.close();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  console.log(`\ntask-app listening on http://localhost:${port}\n`);
}
