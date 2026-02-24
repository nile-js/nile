import type { BaseContext, NileContext, Sessions } from "./types";

/** In-memory store for authentication sessions per interface type (rest, ws, rpc) */
const sessions: Sessions = {};

/**
 * Creates a new Nile context with an internal key-value store.
 * The context carries interface-specific data (REST, WebSocket, RPC),
 * hook execution context, and provides get/set methods for storing arbitrary values.
 *
 * @param interfaceContext - Optional base context containing interface adapters
 * @returns A fully initialized NileContext
 */
export function createNileContext(interfaceContext?: BaseContext): NileContext {
  const store = new Map<string, unknown>();

  const context: NileContext = {
    rest: interfaceContext?.rest,
    ws: interfaceContext?.ws,
    rpc: interfaceContext?.rpc,
    _store: store,

    get<T = unknown>(key: string): T | undefined {
      return store.get(key) as T | undefined;
    },

    set<T = unknown>(key: string, value: T): void {
      store.set(key, value);
    },

    hookContext: {
      actionName: "",
      input: null,
      state: {},
      log: { before: [], after: [] },
    },

    updateHookState(key: string, value: unknown) {
      this.hookContext.state[key] = value;
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
      this.hookContext.log[phase].push(logEntry);
    },

    setHookError(error: string) {
      this.hookContext.error = error;
    },

    setHookOutput(output: unknown) {
      this.hookContext.output = output;
    },

    resetHookContext(actionName: string, input: unknown) {
      this.hookContext = {
        actionName,
        input,
        state: {},
        log: { before: [], after: [] },
      };
    },
  };

  return context;
}

/**
 * Retrieves all active authentication sessions.
 * @returns The sessions object containing all registered auth sessions
 */
export const getSessions = () => sessions;

/**
 * Registers or updates an authentication session for a specific interface.
 * @param sessionName - The interface type: 'rest', 'ws', or 'rpc'
 * @param sessionData - The session data to store
 */
export const setSession = (
  sessionName: keyof Sessions,
  sessionData: unknown
): void => {
  sessions[sessionName] = sessionData as Record<string, unknown>;
};
