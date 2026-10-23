import { superPromise } from "slang-ts";

/** Use Slang's external settlement to cancel backoff immediately without orphaning a timer. */
export async function waitRetryDelay(ms: number, signal: AbortSignal) {
  const waiting = superPromise<void>();
  const abort = () => waiting.abort();
  const timer = setTimeout(() => waiting.resolve(undefined), ms);
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) {
    abort();
  }
  return await waiting.finally(() => {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  });
}
