import type { Result } from "slang-ts";

export type RateLimitStrategy =
  | { strategy: "fixed-window"; limit: number; windowMs: number }
  | { strategy: "sliding-window"; limit: number; windowMs: number }
  | { strategy: "token-bucket"; capacity: number; refillPerSecond: number };

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
  reason?: "quota" | "cooldown" | "capacity";
}

export interface RateLimitRequest {
  key: string;
  cost?: number;
}

/** Shared implementations must atomically check and consume the complete allowance. */
export interface RateLimitStore {
  consume: (
    request: RateLimitRequest
  ) =>
    | Result<RateLimitDecision, string>
    | Promise<Result<RateLimitDecision, string>>;
  close?: () => void | Promise<void>;
}

export type RateLimiterOptions = RateLimitStrategy & {
  /** Additional blocking after a denied request; omitted means quota recovery only. */
  cooldown?: { durationMs: number; multiplier?: number; maxMs?: number };
  maxKeys?: number;
  /** Active allowances are never evicted to admit a new key. */
  eviction?: "expired" | "reject-new";
  /** Inject a monotonic millisecond clock for deterministic callers. */
  clock?: () => number;
};

export interface RateLimiter extends RateLimitStore {
  consume: (request: RateLimitRequest) => Result<RateLimitDecision, string>;
  reset: (key?: string) => void;
  size: () => number;
}
