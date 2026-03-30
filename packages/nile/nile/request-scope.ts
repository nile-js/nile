import { AsyncLocalStorage } from "node:async_hooks";
import type { Context as HonoContext } from "hono";
import type { RPCContext, Sessions, WebSocketContext } from "./types";

/** Per-request state isolated via AsyncLocalStorage — never shared between concurrent requests */
export interface RequestStore {
  rest?: HonoContext;
  ws?: WebSocketContext;
  rpc?: RPCContext;
  sessions: Sessions;
}

/** Single ALS instance shared across the entire Nile process */
const requestScope = new AsyncLocalStorage<RequestStore>();

/**
 * Runs a callback within a per-request scope.
 * Everything inside `fn` (including any async continuations) sees the same
 * isolated RequestStore — concurrent requests never interfere.
 *
 * @param store - The per-request state to make available during `fn`
 * @param fn - The async work to run within the scope
 * @returns The return value of `fn`
 */
export function runInRequestScope<T>(
  store: RequestStore,
  fn: () => T | Promise<T>
): T | Promise<T> {
  return requestScope.run(store, fn);
}

/**
 * Retrieves the current request's scoped store.
 * Returns undefined when called outside a request scope (e.g. during boot).
 */
export function getRequestStore(): RequestStore | undefined {
  return requestScope.getStore();
}
