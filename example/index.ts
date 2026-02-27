import { createLogger, createNileServer } from "../dist/index.js";
import { services } from "./services/services.config.js";

// --- Application logger (uses the logging module with monthly chunking) ---

const logger = createLogger("task-app", { chunking: "monthly" });

// --- Create the server ---

const server = createNileServer({
  serverName: "task-app",
  services,
  resources: { logger },
  rest: {
    baseUrl: "/api",
    host: "localhost",
    port: 3000,
    allowedOrigins: ["http://localhost:3000"],
    enableStatus: true,
  },
  onBoot: {
    fn: () => {
      logger.info({
        atFunction: "onBoot",
        message: "Task app booted successfully",
      });
    },
  },
});

// --- Start listening ---

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
