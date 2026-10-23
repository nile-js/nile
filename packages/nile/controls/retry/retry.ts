import { Err, Ok, type Result, superPromise } from "slang-ts";
import { runRetryAttempt } from "./attempt";
import { resolveRetryOptions } from "./options";
import type { RetryAttempt, RetryOptions } from "./types";

/** Poll/retry only under an explicit policy; cancellation prevents another attempt and never overlaps work. */
export async function retryFnWithJitter<Value, Output = Value>(
  options: RetryOptions<Value, Output>
): Promise<Result<Output, string>> {
  const bounds = resolveRetryOptions(options);
  if (options.signal?.aborted) {
    return Err("Retry cancelled");
  }
  const running = superPromise<Output>(
    async (deadlineSignal): Promise<Result<Output, string>> => {
      const signal = options.signal
        ? AbortSignal.any([options.signal, deadlineSignal])
        : deadlineSignal;
      const history: RetryAttempt[] = [];
      for (let attempt = 1; attempt <= bounds.maxAttempts; attempt++) {
        const decided = await runRetryAttempt({
          options,
          bounds,
          attempt,
          history,
          signal,
        });
        if (decided.isErr) {
          return Err(decided.error);
        }
        const decision = decided.value;
        if (decision.kind === "end") {
          return Ok(decision.value);
        }
        if (decision.kind === "stop") {
          return Err(decision.message);
        }
      }
      return Err(`Retry exhausted after ${bounds.maxAttempts} attempts`);
    },
    { timeout: bounds.timeoutMs }
  );
  // Slang's timeout aborts cooperatively. Await actual settlement so a queue retains its slot
  // when an application function ignores cancellation; never hide still-running work.
  const result = await running;
  return result.isErr && result.error === "Timed out"
    ? Err("Retry deadline exceeded")
    : result;
}
