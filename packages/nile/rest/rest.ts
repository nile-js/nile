import type { Context } from "hono";
import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import z from "zod";
import type { AuthContext } from "@/auth/types";
import { applyCorsConfig } from "@/cors/cors";
import type { Engine } from "@/engine/types";
import type {
  ExternalRequest,
  ExternalResponse,
  NileContext,
  ServerRuntime,
} from "@/nile/types";
import { createDiagnosticsLog } from "@/utils";
import { intentHandlers } from "./intent-handlers";
import { applyRateLimiting, applyStaticServing } from "./middleware";
import type { RestConfig } from "./types";
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
  authContext: AuthContext,
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
        contentTypeCheck.statusCode ?? 415
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
      uploadResult.statusCode ?? 400
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
  const response = await (handler as any)(
    engine,
    request,
    nileContext,
    authContext
  );

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

  // Single POST endpoint for all service interactions
  const servicesPath = `${config.baseUrl}/services`;

  app.post(servicesPath, async (c) => {
    const contentType = c.req.header("content-type") ?? "";
    const isFormData = contentType.includes("multipart/form-data");

    // Build auth context from the incoming HTTP request
    const authContext: AuthContext = {
      headers: c.req.raw.headers,
      cookies: getCookie(c),
    };

    // --- Form-data path (multipart uploads) ---
    if (isFormData) {
      return handleFormDataPath(
        c,
        config,
        engine,
        nileContext,
        authContext,
        log
      );
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

    const handler = intentHandlers[request.intent];
    // biome-ignore lint/suspicious/noExplicitAny: internal dispatch
    const response = await (handler as any)(
      engine,
      request,
      nileContext,
      authContext
    );

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
