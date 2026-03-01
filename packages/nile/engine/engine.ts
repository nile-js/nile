import { Err, Ok, type Result } from "slang-ts";
import { verifyJWT } from "@/auth/jwt-handler";
import type { AuthConfig, AuthContext } from "@/auth/types";
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
  EngineOptions,
  ServiceSummary,
} from "./types";

/**
 * Verify JWT for a protected action. Returns Ok(void) on success or skip,
 * Err(message) if auth is required but fails.
 */
async function authenticateAction(
  action: Action,
  auth: AuthConfig | undefined,
  authContext: AuthContext | undefined,
  nileContext: NileContext<unknown>,
  serviceName: string,
  actionName: string,
  log: (msg: string) => void
): Promise<Result<void, string>> {
  if (!(action.isProtected && auth)) {
    return Ok(undefined);
  }

  if (!authContext) {
    return Err("Authentication required: no auth context provided");
  }

  const authResult = await verifyJWT(authContext, auth);
  if (authResult.isErr) {
    log(`Auth failed for ${serviceName}.${actionName}: ${authResult.error}`);
    return Err(authResult.error);
  }

  nileContext.authResult = authResult.value;
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

  // Build stores once on init
  const initStartTime = performance.now();
  const seenServiceNames = new Set<string>();

  for (const service of services) {
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
  }

  log(
    `Initialized in ${performance.now() - initStartTime}ms. Loaded ${services.length} services.`
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

  const executeAction = async (
    serviceName: string,
    actionName: string,
    payload: unknown,
    nileContext: NileContext<unknown>,
    authContext?: AuthContext
  ): Promise<Result<unknown, string>> => {
    const { onBeforeActionHandler, onAfterActionHandler } = options;

    // Resolve action
    const actionResult = getAction(serviceName, actionName);
    if (actionResult.isErr) {
      return Err(actionResult.error);
    }
    const action = actionResult.value;

    // Reset hook context for this execution
    nileContext.resetHookContext(`${serviceName}.${actionName}`, payload);

    // Step 0: Auth — verify JWT for protected actions
    const authStep = await authenticateAction(
      action,
      options.auth,
      authContext,
      nileContext,
      serviceName,
      actionName,
      log
    );
    if (authStep.isErr) {
      return Err(authStep.error);
    }

    // Step 1: Global Before Hook
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

    // Step 2: Action Before Hooks
    const beforeHooksResult = await processHooks(
      action.hooks?.before ?? [],
      payload,
      getAction,
      nileContext,
      "before",
      log
    );
    if (beforeHooksResult.isErr) {
      return Err(beforeHooksResult.error);
    }

    // Step 3: Validation
    const validationResult = validatePayload(
      action,
      beforeHooksResult.value,
      nileContext,
      log
    );
    if (validationResult.isErr) {
      return Err(validationResult.error);
    }

    // Step 4: Handler
    const handlerResult = await runHandler(
      action,
      validationResult.value,
      nileContext,
      log
    );
    if (handlerResult.isErr) {
      return Err(handlerResult.error);
    }

    // Step 5: Action After Hooks
    const afterHooksResult = await processHooks(
      action.hooks?.after ?? [],
      handlerResult.value,
      getAction,
      nileContext,
      "after",
      log
    );
    if (afterHooksResult.isErr) {
      return Err(afterHooksResult.error);
    }

    // Step 6: Global After Hook
    const globalAfterResult = await runGlobalAfterHook(
      onAfterActionHandler,
      nileContext,
      action,
      validationResult.value,
      afterHooksResult.value,
      log
    );
    if (globalAfterResult.isErr) {
      return Err(globalAfterResult.error);
    }

    // Final response
    return action.result?.pipeline
      ? Ok({
          data: globalAfterResult.value,
          pipeline: nileContext.hookContext.log,
        })
      : Ok(globalAfterResult.value);
  };

  return {
    getServices,
    getServiceActions,
    getAction,
    executeAction,
  };
}
