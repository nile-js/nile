import type { Result } from "slang-ts";

export interface RetryAttempt {
  attempt: number;
  delayBeforeMs: number;
  /** Milliseconds since epoch with the default clock. */
  startedAt: number;
  durationMs: number;
  success: boolean;
}
export type RetryDecision<T> =
  | { kind: "retry" }
  | { kind: "end"; value: T }
  | { kind: "stop"; message: string };
export interface RetryContext<Value, Output> {
  attempt: number;
  attempts: readonly RetryAttempt[];
  result: Result<Value, string>;
  retry: () => RetryDecision<Output>;
  end: (value: Output) => RetryDecision<Output>;
  stop: (message: string) => RetryDecision<Output>;
}
export interface RetryOptions<Value, Output = Value> {
  fn: (
    signal: AbortSignal,
    attempt: number
  ) => Value | Result<Value, string> | Promise<Value | Result<Value, string>>;
  /** Every retry is explicitly selected by the caller's business policy. */
  onResult: (context: RetryContext<Value, Output>) => RetryDecision<Output>;
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterMs?: number;
  initialDelayMs?: number;
  /** Whole-run cooperative deadline; functions must honor the supplied signal. */
  timeoutMs?: number;
  maxHistory?: number;
  signal?: AbortSignal;
  random?: () => number;
  clock?: () => number;
}
