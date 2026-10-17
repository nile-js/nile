import { Err, Ok, type Result } from "slang-ts";
import { verifyJWT } from "@/auth/jwt-handler";
import type { AuthConfig } from "@/auth/types";
import { runInActionScope } from "@/nile/request-scope";
import type { NileContext } from "@/nile/types";
import { createDiagnosticsLog } from "@/utils";
import {
  processHooks,
  runGlobalAfterHook,
  runGlobalBeforeHook,
  runHandler,
  validatePayload,
} from "./pipeline";
import type {
  Action,
  ActionSummary,
  Engine,
  EngineOptions,
  EngineStats,
  ServiceStats,
  ServiceSummary,
} from "./types";

/**
 * Verify JWT for a protected action. Extracts credentials from the per-request
 * Hono context (via AsyncLocalStorage) and writes the verified identity to the
 * store via setSession("rest", ...).
 *
 * Returns Ok(void) on success or skip, Err(message) if auth is required but fails.
 */
async function authenticateAction(
  action: Action,
  auth: AuthConfig | undefined,
  nileContext: NileContext<unknown>,
  serviceName: string,
  actionName: string,
  log: (msg: string) => void
): Promise<Result<void, string>> {
  if (!(action.isProtected && auth)) {
    return Ok(undefined);
  }

  // Extract auth credentials from the per-request Hono context (via AsyncLocalStorage)
  const honoCtx = nileContext.get<import("hono").Context>("rest");
  if (!honoCtx) {
    return Err("Authentication required: no request context available");
  }

  const { getCookie } = await import("hono/cookie");
  const authContext = {
    headers: honoCtx.req.raw.headers,
    cookies: getCookie(honoCtx),
  };

  const authResult = await verifyJWT(authContext, auth);
  if (authResult.isErr) {
    log(`Auth failed for ${serviceName}.${actionName}: ${authResult.error}`);
    return Err(authResult.error);
  }

  // Write verified identity to the session store — single source of truth
  nileContext.setSession("rest", {
    userId: authResult.value.userId,
    organizationId: authResult.value.organizationId,
    ...authResult.value.claims,
  });

  log(
    `Auth OK for ${serviceName}.${actionName} (user: ${authResult.value.userId})`
  );
  return Ok(undefined);
}

export function createEngine(options: EngineOptions) {
  const { diagnostics, services, logger } = options;

  const log = createDiagnosticsLog("Engine", {
    diagnostics,
    logger: logger as unknown as Parameters<
      typeof createDiagnosticsLog
    >[1]["logger"],
  });

  // O(1) Pre-computed Lookups
  const serviceSummaries: ServiceSummary[] = [];
  const serviceActionsStore: Record<string, ActionSummary[]> = {};
  const actionStore: Record<string, Record<string, Action>> = {};
  const serviceStats: ServiceStats[] = [];

  // Build stores once on init
  const initStartTime = performance.now();
  const seenServiceNames = new Set<string>();

  for (const service of services) {
    const registrationStart = performance.now();
    // Fail fast on duplicate service names
    if (seenServiceNames.has(service.name)) {
      throw new Error(
        `Duplicate service name '${service.name}'. Service names must be unique.`
      );
    }
    seenServiceNames.add(service.name);

    const seenActionNames = new Set<string>();
    const actionNames: string[] = [];
    serviceActionsStore[service.name] = [];
    actionStore[service.name] = {};

    for (const action of service.actions) {
      // Fail fast on duplicate action names within a service
      if (seenActionNames.has(action.name)) {
        throw new Error(
          `Duplicate action name '${action.name}' in service '${service.name}'. Action names must be unique within a service.`
        );
      }
      seenActionNames.add(action.name);

      actionNames.push(action.name);

      serviceActionsStore[service.name]?.push({
        name: action.name,
        description: action.description,
        isProtected: !!action.isProtected,
        validation: !!action.validation,
        accessControl: action.accessControl || [],
        visibility: action.visibility,
      });

      const serviceActions = actionStore[service.name];
      if (serviceActions) {
        serviceActions[action.name] = action;
      }
    }

    serviceSummaries.push({
      name: service.name,
      description: service.description,
      meta: service.meta,
      actions: actionNames,
    });
    serviceStats.push({
      name: service.name,
      description: service.description,
      actionCount: actionNames.length,
      registrationDurationMs: performance.now() - registrationStart,
    });
  }

  const registrationStats: EngineStats = {
    totalServices: serviceStats.length,
    totalActions: serviceStats.reduce(
      (total, service) => total + service.actionCount,
      0
    ),
    registrationDurationMs: performance.now() - initStartTime,
    services: serviceStats,
  };

  /** Preserve startup measurements while allowing callers to inspect their own copy. */
  const stats = (): EngineStats => ({
    ...registrationStats,
    services: serviceStats.map((service) => ({ ...service })),
  });

  log(
    `Initialized in ${registrationStats.registrationDurationMs}ms. Loaded ${registrationStats.totalServices} services.`
  );

  // --- Discovery API ---

  const getServices = (): Result<ServiceSummary[], string> =>
    Ok(serviceSummaries);

  const getServiceActions = (
    serviceName: string
  ): Result<ActionSummary[], string> => {
    const actions = serviceActionsStore[serviceName];
    return actions ? Ok(actions) : Err(`Service '${serviceName}' not found`);
  };

  const getAction = (
    serviceName: string,
    actionName: string
  ): Result<Action, string> => {
    const serviceMap = actionStore[serviceName];
    if (!serviceMap) {
      return Err(`Service '${serviceName}' not found`);
    }

    const action = serviceMap[actionName];
    return action
      ? Ok(action)
      : Err(`Action '${actionName}' not found in service '${serviceName}'`);
  };

  const runAction = async (
    serviceName: string,
    actionName: string,
    payload: unknown,
    nileContext: NileContext<unknown>
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: explicit optional-phase guards avoid no-op async Results while preserving fixed pipeline order
  ): Promise<Result<unknown, string>> => {
    const { onBeforeActionHandler, onAfterActionHandler } = options;

    // Resolve action
    const actionResult = getAction(serviceName, actionName);
    if (actionResult.isErr) {
      return Err(actionResult.error);
    }
    const action = actionResult.value;

    // Skip only absent phases; configured callbacks still run in the existing order.
    const auth = options.auth;
    if (action.isProtected && auth) {
      const authStep = await authenticateAction(
        action,
        auth,
        nileContext,
        serviceName,
        actionName,
        log
      );
      if (authStep.isErr) {
        return Err(authStep.error);
      }
    }

    if (onBeforeActionHandler) {
      const globalBeforeResult = await runGlobalBeforeHook(
        onBeforeActionHandler,
        nileContext,
        action,
        payload,
        log
      );
      if (globalBeforeResult.isErr) {
        return Err(globalBeforeResult.error);
      }
    }

    let validatedPayload = payload;
    const beforeHooks = action.hooks?.before;
    if (beforeHooks?.length) {
      const beforeHooksResult = await processHooks(
        beforeHooks,
        validatedPayload,
        getAction,
        nileContext,
        "before",
        log
      );
      if (beforeHooksResult.isErr) {
        return Err(beforeHooksResult.error);
      }
      validatedPayload = beforeHooksResult.value;
    }

    if (action.validation) {
      const validationResult = validatePayload(
        action,
        validatedPayload,
        nileContext,
        log
      );
      if (validationResult.isErr) {
        return Err(validationResult.error);
      }
      validatedPayload = validationResult.value;
    }

    // Handler crash safety and isolated hook state apply even when no optional phases exist.
    const handlerResult = await runHandler(
      action,
      validatedPayload,
      nileContext,
      log
    );
    if (handlerResult.isErr) {
      return Err(handlerResult.error);
    }

    let output = handlerResult.value;
    const afterHooks = action.hooks?.after;
    if (afterHooks?.length) {
      const afterHooksResult = await processHooks(
        afterHooks,
        output,
        getAction,
        nileContext,
        "after",
        log
      );
      if (afterHooksResult.isErr) {
        return Err(afterHooksResult.error);
      }
      output = afterHooksResult.value;
    }

    if (onAfterActionHandler) {
      const globalAfterResult = await runGlobalAfterHook(
        onAfterActionHandler,
        nileContext,
        action,
        validatedPayload,
        output,
        log
      );
      if (globalAfterResult.isErr) {
        return Err(globalAfterResult.error);
      }
      output = globalAfterResult.value;
    }

    return action.result?.pipeline
      ? Ok({ data: output, pipeline: nileContext.hookContext.log })
      : Ok(output);
  };

  /** Child scopes also isolate direct engine calls and restore state after nested actions. */
  const executeAction: Engine["executeAction"] = (
    serviceName,
    actionName,
    payload,
    nileContext
  ) =>
    runInActionScope({
      actionName: `${serviceName}.${actionName}`,
      input: payload,
      fn: () => runAction(serviceName, actionName, payload, nileContext),
    });

  return {
    stats,
    getServices,
    getServiceActions,
    getAction,
    executeAction,
  };
}
