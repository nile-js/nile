import { AsyncLocalStorage } from "node:async_hooks";
import type { Context as HonoContext } from "hono";
import type { HookContext } from "@/engine/types";
import type { NativeRequestContext } from "@/native/types";
import type { AuthContext } from "../auth/types";
import type { ExecutionContext } from "../execution/types";
import { createHookContext } from "./hook-context";
import type {
  NileContext,
  RPCContext,
  Sessions,
  WebSocketContext,
} from "./types";

/** One schema problem, addressed by its dotted field path (empty for the payload itself). */
export interface ValidationIssue {
  path: string;
  message: string;
}

/**
 * Details a transport can add to a failed response. Nested execution scopes copy the
 * store shallowly, so they share this object with the request that created it.
 */
export interface RequestFailureDetails {
  validationIssues?: ValidationIssue[];
}

/**
 * Details a transport can add to a successful response. Nested execution scopes share
 * this object too; the outermost action finishes last, so its message is the one kept.
 */
export interface RequestSuccessDetails {
  message?: string;
}

/** Per-request state isolated via AsyncLocalStorage — never shared between concurrent requests */
export interface RequestStore {
  context?: NileContext;
  admissionSignal?: AbortSignal;
  traceHook?: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
  execution?: ExecutionContext;
  credentials?: AuthContext;
  rest?: HonoContext;
  nativeRest?: NativeRequestContext;
  ws?: WebSocketContext;
  rpc?: RPCContext;
  sessions: Sessions;
  hookContext?: HookContext;
  failure?: RequestFailureDetails;
  success?: RequestSuccessDetails;
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

/** Isolate hook state while preserving transport identity and shared request sessions. */
export function runInActionScope<T>({
  actionName,
  input,
  fn,
}: Pick<HookContext, "actionName" | "input"> & { fn: () => T }): T {
  const parent = getRequestStore();
  return requestScope.run(
    {
      ...parent,
      sessions: parent?.sessions ?? {},
      hookContext: createHookContext({ actionName, input }),
    },
    fn
  );
}
