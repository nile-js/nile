import { Err, type Result, safeTry } from "slang-ts";
import { runControlledTask } from "../pending-call";
import { waitRetryDelay } from "./delay";
import type { resolveRetryOptions } from "./options";
import type { RetryAttempt, RetryDecision, RetryOptions } from "./types";

/** Observe one real attempt; the policy sees bounded timing metadata and the current Result only. */
export async function runRetryAttempt<Value, Output>({
  options,
  bounds,
  attempt,
  history,
  signal,
}: {
  options: RetryOptions<Value, Output>;
  bounds: ReturnType<typeof resolveRetryOptions<Value, Output>>;
  attempt: number;
  history: RetryAttempt[];
  signal: AbortSignal;
}): Promise<Result<RetryDecision<Output>, string>> {
  if (signal.aborted) {
    return Err("Retry cancelled");
  }
  const delay = bounds.computeDelay(attempt);
  if (delay > 0) {
    const waited = await waitRetryDelay(delay, signal);
    if (waited.isErr) {
      return Err("Retry cancelled");
    }
  }
  if (signal.aborted) {
    return Err("Retry cancelled");
  }
  const startedAt = bounds.clock();
  const result = await runControlledTask(
    (value: number, operationSignal) => options.fn(operationSignal, value),
    attempt,
    signal
  );
  if (signal.aborted) {
    return Err("Retry cancelled");
  }
  history.push({
    attempt,
    delayBeforeMs: delay,
    startedAt,
    durationMs: Math.max(0, bounds.clock() - startedAt),
    success: result.isOk,
  });
  if (history.length > bounds.maxHistory) {
    history.shift();
  }
  const decided = await safeTry(() =>
    options.onResult({
      attempt,
      attempts: history.map((item) => ({ ...item })),
      result,
      retry: () => ({ kind: "retry" }),
      end: (value) => ({ kind: "end", value }),
      stop: (message) => ({ kind: "stop", message }),
    })
  );
  if (
    decided.isErr ||
    !decided.value ||
    !["retry", "end", "stop"].includes(decided.value.kind)
  ) {
    return Err("Retry policy failed");
  }
  return decided;
}
