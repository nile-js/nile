import type { RetryOptions } from "./types";

/** Reject invalid callbacks before a business operation is invoked. */
function assertCallbacks<Value, Output>(options: RetryOptions<Value, Output>) {
  if (
    typeof options.fn !== "function" ||
    typeof options.onResult !== "function"
  ) {
    throw new Error("Retry requires an operation and a decision policy");
  }
  if (options.clock !== undefined && typeof options.clock !== "function") {
    throw new Error("Retry clock must be a function");
  }
  if (options.random !== undefined && typeof options.random !== "function") {
    throw new Error("Retry random source must be a function");
  }
}

/** Validate limits once, before starting attempts or allocating any timer. */
export function resolveRetryOptions<Value, Output>(
  options: RetryOptions<Value, Output>
) {
  assertCallbacks(options);
  const bounds = {
    maxAttempts: options.maxAttempts ?? 10,
    maxHistory: options.maxHistory ?? 20,
    baseDelayMs: options.baseDelayMs ?? 2000,
    maxDelayMs: options.maxDelayMs ?? 30_000,
    jitterMs: options.jitterMs ?? 500,
    initialDelayMs: options.initialDelayMs ?? 0,
    timeoutMs: options.timeoutMs ?? 60_000,
  };
  for (const [name, value] of Object.entries(bounds)) {
    const minimum = name === "jitterMs" || name === "initialDelayMs" ? 0 : 1;
    if (
      !Number.isSafeInteger(value) ||
      value < minimum ||
      value > 2_147_483_647
    ) {
      throw new Error(`Retry ${name} is outside its supported bounds`);
    }
  }
  if (bounds.maxHistory > 1000) {
    throw new Error("Retry maxHistory cannot exceed 1000");
  }
  const random = options.random ?? Math.random;
  const computeDelay = (attempt: number) => {
    if (attempt === 1) {
      return Math.min(bounds.initialDelayMs, bounds.maxDelayMs);
    }
    const cap = Math.min(
      bounds.maxDelayMs,
      bounds.baseDelayMs * 2 ** Math.min(attempt - 2, 31)
    );
    const jitter = Math.min(bounds.jitterMs, cap);
    const sample = random();
    if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
      throw new Error(
        "Retry random source must return a number between zero and one"
      );
    }
    return Math.max(1, Math.floor(cap - jitter + sample * jitter));
  };
  return {
    ...bounds,
    computeDelay,
    clock: options.clock ?? Date.now,
  };
}
