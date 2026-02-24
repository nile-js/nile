import type { BaseContext, NileContext, Resources, Sessions } from "./types";

interface CreateNileContextParams {
  interfaceContext?: BaseContext;
  resources?: Resources;
}

/**
 * Creates a new Nile context with an internal key-value store.
 * The context carries interface-specific data (REST, WebSocket, RPC),
 * hook execution context, and provides get/set methods for storing arbitrary values.
 *
 * Sessions are instance-scoped — each NileContext owns its own session store,
 * so multiple server instances don't share authentication state.
 *
 * @param params - Optional configuration including interface adapters and shared resources
 * @returns A fully initialized NileContext
 */
export function createNileContext(
  params?: CreateNileContextParams
): NileContext {
  const store = new Map<string, unknown>();
  const interfaceContext = params?.interfaceContext;

  /** Instance-scoped session store — not shared across server instances */
  const sessions: Sessions = {};

  const context: NileContext = {
    rest: interfaceContext?.rest,
    ws: interfaceContext?.ws,
    rpc: interfaceContext?.rpc,
    resources: params?.resources,
    sessions,
    _store: store,

    get<T = unknown>(key: string): T | undefined {
      return store.get(key) as T | undefined;
    },

    set<T = unknown>(key: string, value: T): void {
      store.set(key, value);
    },

    getSession(name: keyof Sessions) {
      return sessions[name];
    },

    setSession(name: keyof Sessions, data: Record<string, unknown>) {
      sessions[name] = data;
    },

    hookContext: {
      actionName: "",
      input: null,
      state: {},
      log: { before: [], after: [] },
    },

    updateHookState(key: string, value: unknown) {
      context.hookContext.state[key] = value;
    },

    addHookLog(
      phase: "before" | "after",
      logEntry: {
        name: string;
        input: unknown;
        output: unknown;
        passed: boolean;
      }
    ) {
      context.hookContext.log[phase].push(logEntry);
    },

    setHookError(error: string) {
      context.hookContext.error = error;
    },

    setHookOutput(output: unknown) {
      context.hookContext.output = output;
    },

    resetHookContext(actionName: string, input: unknown) {
      context.hookContext = {
        actionName,
        input,
        state: {},
        log: { before: [], after: [] },
      };
    },
  };

  return context;
}
