import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import z from "zod";
import { createActionCors } from "@/cors/action-cors";
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
import type { NileLifecycle } from "../lifecycle/types";
import { getRequestStore } from "../nile/request-scope";
import { createHttpBoundary } from "../protection/http";
import { checkDiscoveryAccess } from "./discovery-access";
import { handleFormDataPath } from "./form-data-handler";
import { applyRateLimiting, applyStaticServing } from "./middleware";
import { createMiddlewareMatcher } from "./middleware-matcher";
import { createRestIntentHandlers } from "./schema-cache";
import type { MiddlewareEntry, RestConfig } from "./types";

const externalRequestSchema = z.object({
  intent: z.enum(["explore", "execute", "schema"]),
  service: z.string().min(1),
  action: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
});

interface CreateRestAppParams {
  lifecycle?: NileLifecycle;
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
 */
export function createRestApp(params: CreateRestAppParams): RestApp {
  const { config, engine, nileContext, serverName, runtime } = params;
  const app = new Hono();
  const boundary = createHttpBoundary(config.protection, params.lifecycle);
  app.use("*", async (c, next) => {
    const response = await boundary(c.req.raw, async (request) => {
      c.req.raw = request;
      await next();
      return c.res;
    });
    // Hono ignores returned middleware responses after finalization; assign the wrapped response explicitly.
    c.res = response;
    return response;
  });

  const handlers = createRestIntentHandlers({ config });

  const log = createDiagnosticsLog("REST", {
    diagnostics: config.diagnostics,
    logger: nileContext.resources?.logger as
      | { info: (msg: string, data?: unknown) => void }
      | undefined,
  });

  // Apply CORS
  const servicesPath = `${config.baseUrl}/services`;
  const actionCors = createActionCors(config, engine, servicesPath);
  applyCorsConfig(app, config, actionCors);

  // Apply rate limiting when a limiting header is configured
  applyRateLimiting(app, config, log);

  // Apply static file serving based on runtime
  applyStaticServing(app, config, runtime, log);

  // --- Dynamic middleware registry ---
  // Registered BEFORE the POST handler so user middleware always runs first
  const middlewareRegistry: MiddlewareEntry[] = [];
  const middlewareMatcher = createMiddlewareMatcher({
    servicesPath,
    readRegistry: () => middlewareRegistry,
  });

  // Keep this boundary synchronous when no user middleware needs to run.
  app.use("*", (c, next) => {
    if (middlewareRegistry.length === 0) {
      return next();
    }
    const matching = middlewareMatcher.match(c.req.path);
    if (matching.length === 0) {
      return next();
    }

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

    return runNext();
  });

  // Single POST endpoint for all service interactions
  app.post(servicesPath, (c) => {
    // Each request gets its own isolated scope, concurrent requests never share mutable state
    return runInRequestScope(
      {
        ...getRequestStore(),
        rest: c,
        sessions: getRequestStore()?.sessions ?? {},
        failure: {},
      },
      async () => {
        const contentType = c.req.header("content-type") ?? "";
        const isFormData = contentType.includes("multipart/form-data");

        // --- Form-data path (multipart uploads) ---
        if (isFormData) {
          return handleFormDataPath(
            c,
            config,
            engine,
            nileContext,
            log,
            handlers,
            actionCors
          );
        }

        // --- JSON path (standard RPC) ---
        const body = await c.req
          .json<Partial<ExternalRequest>>()
          .catch(() => null);

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

        const pendingCors = actionCors?.select(c, body);
        if (pendingCors) {
          await pendingCors;
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
        const discovery = checkDiscoveryAccess(
          request.intent,
          request.payload,
          config
        );
        if (!discovery.allowed) {
          return c.json(
            {
              status: false,
              message: discovery.message ?? "Forbidden",
              data: {},
            } satisfies ExternalResponse,
            403
          );
        }

        const handler = handlers[request.intent];
        const response = await handler(engine, request, nileContext);

        const statusCode = response.status ? 200 : 400;
        return c.json(response, statusCode);
      }
    );
  });

  // Health check endpoint
  if (config.enableStatus) {
    app.get("/ready", (c) =>
      c.json(
        {
          status: params.lifecycle?.isReady() ?? true,
          message:
            params.lifecycle?.isReady() === false ? "Not ready" : "Ready",
          data: {},
        },
        params.lifecycle?.isReady() === false ? 503 : 200
      )
    );
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
    middlewareMatcher.invalidate();
  };

  return { app, addMiddleware };
}
