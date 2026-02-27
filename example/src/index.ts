import { createLogger, createNileServer } from "@nilejs/nile";
import { sql } from "drizzle-orm";
import { safeTry } from "slang-ts";
import { db } from "@/db/client";
import { services } from "@/services/services.config";

const logger = createLogger("task-app", { chunking: "monthly" });

/**
 * Push schema to PGLite on boot.
 * Creates the tasks table if it doesn't exist.
 */
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

const server = createNileServer({
  serverName: "task-app",
  services,
  resources: { logger, database: db },
  rest: {
    baseUrl: "/api",
    host: "localhost",
    port: 3000,
    allowedOrigins: ["http://localhost:3000"],
    enableStatus: true,
  },
  onBoot: {
    fn: async () => {
      await pushSchema();
      logger.info({
        atFunction: "onBoot",
        message: "Task app booted — PGLite schema ready",
      });
    },
  },
});

if (server.rest) {
  const port = server.config.rest?.port ?? 3000;
  const { fetch } = server.rest.app;

  Bun.serve({ port, fetch });

  console.log(`\nTask app listening on http://localhost:${port}`);
  console.log("\nTry it:");
  console.log(`  curl -X POST http://localhost:${port}/api/services \\`);
  console.log(`    -H "Content-Type: application/json" \\`);
  console.log(
    `    -d '{"intent":"explore","service":"*","action":"*","payload":{}}'`
  );
}
