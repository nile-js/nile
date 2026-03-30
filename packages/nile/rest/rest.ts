import type { Context } from "hono";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import z from "zod";
import { applyCorsConfig } from "@/cors/cors";
import type { Engine } from "@/engine/types";
import { runInRequestScope } from "@/nile/request-scope";
import type {
  ExternalRequest,
  ExternalResponse,
  NileContext,
  ServerRuntime,
} from "@/nile/types";
import { createDiagnosticsLog } from "@/utils";
import { intentHandlers } from "./intent-handlers";
import { applyRateLimiting, applyStaticServing } from "./middleware";
import type { MiddlewareEntry, RestConfig } from "./types";
import { enforceActionContentType, handleFormDataRequest } from "./uploads";

// --- Zod schema for incoming requests ---

const externalRequestSchema = z.object({
  intent: z.enum(["explore", "execute", "schema"]),
  service: z.string().min(1),
  action: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
});

/** Zod schema for the RPC routing fields extracted from form-data */
const formDataRoutingSchema = z.object({
  intent: z.enum(["explore", "execute", "schema"]),
  service: z.string().min(1),
  action: z.string().min(1),
});

/**
 * Handles multipart/form-data requests by extracting RPC routing fields,
 * parsing files, running validation, and dispatching to the intent handler.
 *
 * Form-data must include 'intent', 'service', 'action' as string fields.
 * Remaining fields/files become the structured payload passed to the action handler.
 */
async function handleFormDataPath(
  c: Context,
  config: RestConfig,
  engine: Engine,
  nileContext: NileContext<unknown>,
  log: (msg: string) => void
) {
  // Extract RPC routing fields from the form data first pass
  const rawBody = await c.req.parseBody({ all: true }).catch(() => null);
  if (!rawBody) {
    return c.json(
      {
        status: false,
        message: "Failed to parse multipart form data",
        data: {},
      } satisfies ExternalResponse,
      400
    );
  }

  const routing = formDataRoutingSchema.safeParse({
    intent: rawBody.intent,
    service: rawBody.service,
    action: rawBody.action,
  });

  if (!routing.success) {
    return c.json(
      {
        status: false,
        message:
          "Form-data must include 'intent', 'service', and 'action' fields",
        data: { errors: routing.error.issues },
      } satisfies ExternalResponse,
      400
    );
  }

  const { intent, service, action } = routing.data;
  log(`${intent} -> ${service}.${action} (form-data)`);

  // Content-type enforcement against action's isSpecial config
  const actionResult = engine.getAction(service, action);
  if (actionResult.isOk && config.uploads?.enforceContentType) {
    const contentTypeCheck = enforceActionContentType(
      actionResult.value,
      "multipart/form-data",
      true
    );
    if (!contentTypeCheck.status) {
      return c.json(
        {
          status: false,
          message: contentTypeCheck.message ?? "Unsupported content type",
          data: contentTypeCheck.data ?? {},
        } satisfies ExternalResponse,
        (contentTypeCheck.statusCode ?? 415) as ContentfulStatusCode
      );
    }
  }

  // Parse and validate uploaded files
  const uploadConfig = config.uploads ?? {};
  const uploadMode = actionResult.isOk
    ? (actionResult.value.isSpecial?.uploadMode ?? "flat")
    : "flat";

  const uploadResult = await handleFormDataRequest(c, uploadConfig, uploadMode);
  if (!(uploadResult.status && uploadResult.data)) {
    return c.json(
      {
        status: false,
        message: uploadResult.message ?? "Upload validation failed",
        data: uploadResult.errorData ?? {},
      } satisfies ExternalResponse,
      (uploadResult.statusCode ?? 400) as ContentfulStatusCode
    );
  }

  // Build the RPC request with the structured payload
  const request: ExternalRequest = {
    intent,
    service,
    action,
    payload: uploadResult.data as unknown as Record<string, unknown>,
  };

  const handler = intentHandlers[request.intent];
  // biome-ignore lint/suspicious/noExplicitAny: internal dispatch
  const response = await (handler as any)(engine, request, nileContext);

  const statusCode = response.status ? 200 : 400;
  return c.json(response, statusCode);
}

// --- Factory ---

interface CreateRestAppParams {
  config: RestConfig;
  engine: Engine;
  nileContext: NileContext<unknown>;
  serverName: string;
  runtime: ServerRuntime;
}

/** Return type of createRestApp — the Hono app plus the middleware registration API */
export interface RestApp {
  app: Hono;
  /** Register middleware that runs before Nile's services POST handler */
  addMiddleware: (path: string, fn: MiddlewareEntry["fn"]) => void;
}

/**
 * Creates the Hono REST app with a single POST endpoint for all service interactions
 * and an optional GET /status health check.
 *
 * Middleware registered via addMiddleware runs before the services POST handler
 * through a dynamic runner registered first in the Hono dispatch chain.
 *
 * All service communication flows through POST {baseUrl}/services using
 * the intent field to discriminate between explore, execute, and schema operations.
 */
export function createRestApp(params: CreateRestAppParams): RestApp {
  const { config, engine, nileContext, serverName, runtime } = params;
  const app = new Hono();

  const log = createDiagnosticsLog("REST", {
    diagnostics: config.diagnostics,
    logger: nileContext.resources?.logger as
      | { info: (msg: string, data?: unknown) => void }
      | undefined,
  });

  // Apply CORS
  applyCorsConfig(app, config);

  // Apply rate limiting when a limiting header is configured
  applyRateLimiting(app, config, log);

  // Apply static file serving based on runtime
  applyStaticServing(app, config, runtime, log);

  // --- Dynamic middleware registry ---
  // Registered BEFORE the POST handler so user middleware always runs first
  const middlewareRegistry: MiddlewareEntry[] = [];

  app.use("*", async (c, next) => {
    const requestPath = c.req.path;
    const matching = middlewareRegistry.filter((entry) =>
      requestPath.startsWith(entry.path)
    );

    // Chain matching middleware sequentially, then hand off to the next Hono handler
    let index = 0;
    const runNext = async (): Promise<void> => {
      if (index < matching.length) {
        const entry = matching[index++];
        const result = await entry?.fn(c, runNext);
        if (result instanceof Response) {
          // Middleware short-circuited the request
          return;
        }
      } else {
        await next();
      }
    };

    await runNext();
  });

  // Single POST endpoint for all service interactions
  const servicesPath = `${config.baseUrl}/services`;

  app.post(servicesPath, (c) => {
    // Each request gets its own isolated scope, concurrent requests never share mutable state
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: single POST handler handles discovery, form-data, JSON, middleware, and intent dispatch
    return runInRequestScope({ rest: c, sessions: {} }, async () => {
      const contentType = c.req.header("content-type") ?? "";
      const isFormData = contentType.includes("multipart/form-data");

      // --- Form-data path (multipart uploads) ---
      if (isFormData) {
        return handleFormDataPath(c, config, engine, nileContext, log);
      }

      // --- JSON path (standard RPC) ---
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

      // Gate explore/schema intents behind discovery config
      if (request.intent === "explore" || request.intent === "schema") {
        if (!config.discovery?.enabled) {
          return c.json(
            {
              status: false,
              message: "API discovery is disabled",
              data: {},
            } satisfies ExternalResponse,
            403
          );
        }

        if (
          config.discovery.secret &&
          request.payload?.discoverySecret !== config.discovery.secret
        ) {
          return c.json(
            {
              status: false,
              message: "Invalid or missing discovery secret",
              data: {},
            } satisfies ExternalResponse,
            403
          );
        }
      }

      const handler = intentHandlers[request.intent];
      // biome-ignore lint/suspicious/noExplicitAny: internal dispatch
      const response = await (handler as any)(engine, request, nileContext);

      const statusCode = response.status ? 200 : 400;
      return c.json(response, statusCode);
    });
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

  // Global error handler — prevents stack trace leaks to clients
  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json(
        {
          status: false,
          message: err.message,
          data: {},
        } satisfies ExternalResponse,
        err.status
      );
    }

    log(`Unhandled error: ${err.message}`, err.stack);
    return c.json(
      {
        status: false,
        message: "Internal server error",
        data: {},
      } satisfies ExternalResponse,
      500
    );
  });

  log(`REST interface ready at ${servicesPath}`);

  const MAX_MIDDLEWARE = 50;

  /** Register middleware that runs before Nile's services POST handler */
  const addMiddleware = (path: string, fn: MiddlewareEntry["fn"]) => {
    if (middlewareRegistry.length >= MAX_MIDDLEWARE) {
      throw new Error(
        `Maximum middleware limit (${MAX_MIDDLEWARE}) reached. Cannot register more middleware.`
      );
    }
    middlewareRegistry.push({ path, fn });
  };

  return { app, addMiddleware };
}
