import { Hono } from "hono";
import z from "zod";
import { applyCorsConfig } from "@/cors/cors";
import type { Engine } from "@/engine/types";
import type {
  ExternalRequest,
  ExternalResponse,
  NileContext,
  ServerRuntime,
} from "@/nile/types";
import { intentHandlers } from "./intent-handlers";
import { applyRateLimiting, applyStaticServing } from "./middleware";
import type { RestConfig } from "./types";

// --- Zod schema for incoming requests ---

const externalRequestSchema = z.object({
  intent: z.enum(["explore", "execute", "schema"]),
  service: z.string().min(1),
  action: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
});

// --- Factory ---

interface CreateRestAppParams {
  config: RestConfig;
  engine: Engine;
  nileContext: NileContext;
  serverName: string;
  runtime: ServerRuntime;
}

/**
 * Creates the Hono REST app with a single POST endpoint for all service interactions
 * and an optional GET /status health check.
 *
 * All service communication flows through POST {baseUrl}/services using
 * the intent field to discriminate between explore, execute, and schema operations.
 */
export function createRestApp(params: CreateRestAppParams): Hono {
  const { config, engine, nileContext, serverName, runtime } = params;
  const app = new Hono();

  const log = (message: string, data?: unknown) => {
    if (!config.diagnostics) {
      return;
    }

    const logger = nileContext.resources?.logger as
      | { info: (msg: string, data?: unknown) => void }
      | undefined;

    if (logger?.info) {
      logger.info(`[REST] ${message}`, data);
    } else {
      console.log(`[REST] ${message}`, data ?? "");
    }
  };

  // Apply CORS
  applyCorsConfig(app, config);

  // Apply rate limiting when a limiting header is configured
  applyRateLimiting(app, config, log);

  // Apply static file serving based on runtime
  applyStaticServing(app, config, runtime, log);

  // Single POST endpoint for all service interactions
  const servicesPath = `${config.baseUrl}/services`;

  app.post(servicesPath, async (c) => {
    const body = await c.req.json().catch(() => null);

    if (!body) {
      return c.json(
        {
          status: false,
          message: "Invalid or missing JSON body",
          data: {},
        } satisfies ExternalResponse,
        400
      );
    }

    const parsed = externalRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          status: false,
          message: "Invalid request format",
          data: { errors: parsed.error.issues },
        } satisfies ExternalResponse,
        400
      );
    }

    const request = parsed.data as ExternalRequest;

    log(`${request.intent} -> ${request.service}.${request.action}`);

    const handler = intentHandlers[request.intent];
    const response = await handler(engine, request, nileContext);

    const statusCode = response.status ? 200 : 400;
    return c.json(response, statusCode);
  });

  // Health check endpoint
  if (config.enableStatus) {
    app.get("/status", (c) => {
      return c.json({
        status: true,
        message: `${serverName} is running`,
        data: {},
      } satisfies ExternalResponse);
    });
  }

  // 404 handler
  app.notFound((c) => {
    return c.json(
      {
        status: false,
        message: `Route not found. Use POST ${servicesPath} for all operations.`,
        data: {},
      } satisfies ExternalResponse,
      404
    );
  });

  log(`REST interface ready at ${servicesPath}`);

  return app;
}
