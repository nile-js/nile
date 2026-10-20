import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import z from "zod";
import type { ActionCors } from "../cors/action-cors";
import type { Engine } from "../engine/types";
import type {
  ExternalRequest,
  ExternalResponse,
  NileContext,
} from "../nile/types";
import { checkDiscoveryAccess } from "./discovery-access";
import type { intentHandlers } from "./intent-handlers";
import type { RestConfig } from "./types";
import { enforceActionContentType, handleFormDataRequest } from "./uploads";

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
export async function handleFormDataPath(
  c: Context,
  config: RestConfig,
  engine: Engine,
  nileContext: NileContext<unknown>,
  log: (msg: string) => void,
  handlers: typeof intentHandlers,
  actionCors?: ActionCors
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

  await actionCors?.select(c, routing.data);
  const { intent, service, action } = routing.data;
  log(`${intent} -> ${service}.${action} (form-data)`);

  const discovery = checkDiscoveryAccess(
    intent,
    rawBody as Record<string, unknown>,
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

  const handler = handlers[request.intent];
  const response = await handler(engine, request, nileContext);

  const statusCode = response.status ? 200 : 400;
  return c.json(response, statusCode);
}
