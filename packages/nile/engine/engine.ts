import { Err, Ok, type Result } from "slang-ts";
import { createDiagnosticsLog } from "@/utils";
import { compileActionExecutor } from "./compile-action";
import type {
  Action,
  ActionSummary,
  Engine,
  EngineOptions,
  EngineStats,
  ServiceStats,
  ServiceSummary,
} from "./types";

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

  function getAction(
    serviceName: string,
    actionName: string
  ): Result<Action, string> {
    const serviceMap = actionStore[serviceName];
    if (!serviceMap) {
      return Err(`Service '${serviceName}' not found`);
    }

    const action = serviceMap[actionName];
    return action
      ? Ok(action)
      : Err(`Action '${actionName}' not found in service '${serviceName}'`);
  }

  const executors = new Map<
    string,
    Map<string, ReturnType<typeof compileActionExecutor>>
  >();

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
    const executorsForService = new Map<
      string,
      ReturnType<typeof compileActionExecutor>
    >();

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
      executorsForService.set(
        action.name,
        compileActionExecutor({
          action,
          serviceName: service.name,
          options,
          getAction,
          log,
        })
      );
    }

    executors.set(service.name, executorsForService);
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

  // --- Discovery API ---

  const getServices = (): Result<ServiceSummary[], string> =>
    Ok(serviceSummaries);

  const getServiceActions = (
    serviceName: string
  ): Result<ActionSummary[], string> => {
    const actions = serviceActionsStore[serviceName];
    return actions ? Ok(actions) : Err(`Service '${serviceName}' not found`);
  };

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

  /** Resolve the compiled executor without allocating an intermediate action Result. */
  const executeAction: Engine["executeAction"] = (
    serviceName,
    actionName,
    payload,
    nileContext
  ) => {
    const actions = executors.get(serviceName);
    if (!actions) {
      return Promise.resolve(Err(`Service '${serviceName}' not found`));
    }
    const execute = actions.get(actionName);
    if (!execute) {
      return Promise.resolve(
        Err(`Action '${actionName}' not found in service '${serviceName}'`)
      );
    }
    return options.execute
      ? options.execute(serviceName, actionName, () =>
          execute(payload, nileContext)
        )
      : execute(payload, nileContext);
  };

  return {
    stats,
    getServices,
    getServiceActions,
    getAction,
    executeAction,
  };
}
