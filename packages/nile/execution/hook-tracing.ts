import { getRequestStore } from "../nile/request-scope";

/** Detailed spans are opt-in; ordinary hook execution does not create a tracing scope. */
export function runObservedHook<T>(
  name: string,
  fn: () => Promise<T>
): Promise<T> {
  const trace = getRequestStore()?.traceHook;
  return trace ? trace(name, fn) : fn();
}
