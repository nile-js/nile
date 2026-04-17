import { createLogger, createNileServer } from "@nilejs/nile";
import { sql } from "drizzle-orm";
import { safeTry } from "slang-ts";
import { db } from "@/db/client";
import { services } from "@/services/services.config";

const logger = createLogger("{{projectName}}", {
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
    console.error("[pushSchema] Failed:", result.error);
  }
};

const server = await createNileServer({
  serverName: "{{projectName}}",
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
    fn: async (ctx) => {
      await pushSchema();
      ctx.resources?.logger?.info({
        atFunction: "onBoot",
        message: "{{projectName}} booted - PGLite schema ready",
      });
    },
  },
});

// Register custom middleware (runs before all service requests)
server.rest?.addMiddleware("/api", async (c, next) => {
  const start = performance.now();
  await next();
  const ms = (performance.now() - start).toFixed(1);
  logger.info({
    atFunction: "requestLog",
    message: `${c.req.method} ${c.req.path} - ${ms}ms`,
  });
});

if (server.rest) {
  const port = server.config.rest?.port ?? 8000;
  Bun.serve({ port, fetch: server.rest.app.fetch });
  console.log(`\n{{projectName}} listening on http://localhost:${port}\n`);
}
