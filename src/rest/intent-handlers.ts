import { Ok, type Result } from "slang-ts";
import z from "zod";
import type { Engine } from "@/engine/types";
import type {
  ExternalRequest,
  ExternalResponse,
  NileContext,
} from "@/nile/types";

// --- Response mapping ---

/**
 * Maps an internal Result to the external API response shape.
 * This is the single point where internal Result types cross the boundary
 * into the HTTP-facing ExternalResponse format.
 */
export function toExternalResponse(
  result: Result<unknown, string>,
  successMessage: string
): ExternalResponse {
  if (result.isOk) {
    const value = result.value;
    const data =
      value !== null && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : { result: value };

    return { status: true, message: successMessage, data };
  }

  return { status: false, message: result.error, data: {} };
}

// --- Intent handlers ---

/**
 * Handles the "explore" intent for service/action discovery.
 * - service: "*", action: "*" -> list all services
 * - service: "name", action: "*" -> list actions for service
 * - service: "name", action: "name" -> action metadata
 */
export function handleExplore(
  engine: Engine,
  request: ExternalRequest
): ExternalResponse {
  const { service, action } = request;

  if (service === "*") {
    return toExternalResponse(engine.getServices(), "Available services");
  }

  if (action === "*") {
    return toExternalResponse(
      engine.getServiceActions(service),
      `Actions for '${service}'`
    );
  }

  const actionResult = engine.getAction(service, action);
  if (actionResult.isErr) {
    return toExternalResponse(actionResult, "");
  }

  const act = actionResult.value;
  return toExternalResponse(
    Ok({
      name: act.name,
      description: act.description,
      isProtected: act.isProtected ?? false,
      accessControl: act.accessControl,
      hooks: act.hooks
        ? { before: act.hooks.before ?? [], after: act.hooks.after ?? [] }
        : null,
      meta: act.meta ?? null,
    }),
    `Details for '${service}.${action}'`
  );
}

/**
 * Handles the "execute" intent by running an action through the engine pipeline.
 */
export async function handleExecute(
  engine: Engine,
  request: ExternalRequest,
  nileContext: NileContext<unknown>
): Promise<ExternalResponse> {
  const { service, action, payload } = request;

  if (service === "*" || action === "*") {
    return {
      status: false,
      message:
        "Execute intent requires specific service and action, wildcards not allowed",
      data: {},
    };
  }

  const result = await engine.executeAction(
    service,
    action,
    payload,
    nileContext
  );

  return toExternalResponse(result, `Action '${service}.${action}' executed`);
}

/**
 * Handles the "schema" intent for Zod-to-JSON-Schema export.
 * - service: "*", action: "*" -> all schemas across all services
 * - service: "name", action: "*" -> all schemas in a service
 * - service: "name", action: "name" -> single action schema
 */
export function handleSchema(
  engine: Engine,
  request: ExternalRequest
): ExternalResponse {
  const { service, action } = request;

  if (service === "*") {
    const servicesResult = engine.getServices();
    if (servicesResult.isErr) {
      return toExternalResponse(servicesResult, "");
    }

    const schemas: Record<string, unknown> = {};
    for (const svc of servicesResult.value) {
      const actionsResult = engine.getServiceActions(svc.name);
      if (actionsResult.isErr) {
        continue;
      }

      schemas[svc.name] = buildServiceSchemas(
        engine,
        svc.name,
        actionsResult.value.map((a) => a.name)
      );
    }

    return toExternalResponse(Ok(schemas), "All service schemas");
  }

  if (action === "*") {
    const actionsResult = engine.getServiceActions(service);
    if (actionsResult.isErr) {
      return toExternalResponse(actionsResult, "");
    }

    const schemas = buildServiceSchemas(
      engine,
      service,
      actionsResult.value.map((a) => a.name)
    );
    return toExternalResponse(Ok(schemas), `Schemas for '${service}'`);
  }

  const actionResult = engine.getAction(service, action);
  if (actionResult.isErr) {
    return toExternalResponse(actionResult, "");
  }

  const schema = extractActionSchema(actionResult.value);
  return toExternalResponse(
    Ok({ [action]: schema }),
    `Schema for '${service}.${action}'`
  );
}

/**
 * Builds a map of action schemas for a service
 */
function buildServiceSchemas(
  engine: Engine,
  serviceName: string,
  actionNames: string[]
): Record<string, unknown> {
  const schemas: Record<string, unknown> = {};

  for (const actionName of actionNames) {
    const actionResult = engine.getAction(serviceName, actionName);
    if (actionResult.isErr) {
      continue;
    }
    schemas[actionName] = extractActionSchema(actionResult.value);
  }

  return schemas;
}

/**
 * Extracts JSON schema from an action's zod validation, returns null on failure
 */
function extractActionSchema(action: {
  validation?: import("zod").ZodType | null;
}): unknown {
  const schema = action.validation;
  if (!schema) {
    return null;
  }

  const { err, result } = safeTrySync(() =>
    z.toJSONSchema(schema, { unrepresentable: "any" })
  );

  return err ? null : result;
}

/**
 * Synchronous try-catch wrapper for simple operations.
 * Unlike slang-ts safeTry (always async), this is for sync-only code paths.
 */
function safeTrySync<T>(fn: () => T): { err: unknown; result: T | null } {
  try {
    return { err: null, result: fn() };
  } catch (error) {
    return { err: error, result: null };
  }
}

// --- Intent dispatch ---

/** Object lookup for intent handlers — cleaner than switch/if-else */
export const intentHandlers: Record<
  ExternalRequest["intent"],
  (
    engine: Engine<unknown>,
    request: ExternalRequest,
    nileContext: NileContext<unknown>
  ) => ExternalResponse | Promise<ExternalResponse>
> = {
  explore: (engine, request) => handleExplore(engine, request),
  execute: (engine, request, nileContext) =>
    handleExecute(engine, request, nileContext),
  schema: (engine, request) => handleSchema(engine, request),
};
