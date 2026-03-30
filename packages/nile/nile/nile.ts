import { getRequestStore } from "./request-scope";
import type { NileContext, Resources, Sessions } from "./types";

/** Keys that are stored per-request via AsyncLocalStorage, not on the global _store */
const REQUEST_SCOPED_KEYS = new Set(["rest", "ws", "rpc"]);

interface CreateNileContextParams<TDB = unknown> {
  resources?: Resources<TDB>;
}

/**
 * Creates a new Nile context with an internal key-value store.
 * The context provides get/set methods for arbitrary global values, and
 * transparently delegates request-scoped reads (rest, ws, rpc, sessions)
 * to AsyncLocalStorage so concurrent requests never share mutable state.
 *
 * Hook context lives on the singleton but is reset at the start of each
 * action execution, so it does not need per-request scoping.
 *
 * @param params - Optional configuration including shared resources
 * @returns A fully initialized NileContext
 */
export function createNileContext<TDB = unknown>(
  params?: CreateNileContextParams<TDB>
): NileContext<TDB> {
  const store = new Map<string, unknown>();

  const context: NileContext<TDB> = {
    resources: params?.resources,
    _store: store,

    get<T = unknown>(key: string): T | undefined {
      // Request-scoped keys read from AsyncLocalStorage
      if (REQUEST_SCOPED_KEYS.has(key)) {
        const reqStore = getRequestStore();
        return reqStore?.[key as keyof typeof reqStore] as T | undefined;
      }
      return store.get(key) as T | undefined;
    },

    set<T = unknown>(key: string, value: T): void {
      store.set(key, value);
    },

    getSession(name: keyof Sessions) {
      const reqStore = getRequestStore();
      return reqStore?.sessions[name];
    },

    setSession(name: keyof Sessions, data: Record<string, unknown>) {
      const reqStore = getRequestStore();
      if (reqStore) {
        reqStore.sessions[name] = data;
      }
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
