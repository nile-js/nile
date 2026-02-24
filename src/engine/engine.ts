import { Err, Ok, type Result } from "slang-ts";
import type { NileContext } from "@/nile/types";
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

export function createEngine(options: EngineOptions) {
  const { diagnostics, services } = options;

  const log = (message: string, data?: unknown) => {
    if (diagnostics) {
      console.log(`[Engine]: ${message}`, data ?? "");
    }
  };

  // O(1) Pre-computed Lookups
  const serviceSummaries: ServiceSummary[] = [];
  const serviceActionsStore: Record<string, ActionSummary[]> = {};
  const actionStore: Record<string, Record<string, Action>> = {};

  // Build stores once on init
  const initStartTime = performance.now();

  for (const service of services) {
    const actionNames: string[] = [];
    serviceActionsStore[service.name] = [];
    actionStore[service.name] = {};

    for (const action of service.actions) {
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

  // --- Execution API ---

  /**
   * Executes an action through the full pipeline:
   * 1. Global before hook (pass/fail guard)
   * 2. Action-level before hooks (sequential, mutates payload)
   * 3. Zod validation
   * 4. Main handler
   * 5. Action-level after hooks (sequential, mutates result)
   * 6. Global after hook (final cleanup)
   */
  const executeAction = async (
    serviceName: string,
    actionName: string,
    payload: unknown,
    nileContext: NileContext
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
