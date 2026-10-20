import { Err, Ok } from "slang-ts";
import { assertPositive } from "./pending-call";
import type {
  RateLimitDecision,
  RateLimiter,
  RateLimiterOptions,
  RateLimitRequest,
} from "./rate-limit-types";

interface Entry {
  used: number;
  startedAt: number;
  updatedAt: number;
  tokens: number;
  hits: { at: number; cost: number }[];
  blockedUntil: number;
  strikes: number;
  expiresAt: number;
}

function getRecoveryTime(
  entry: Entry,
  cost: number,
  limit: number,
  now: number
): number {
  let recovered = 0;
  for (const hit of entry.hits) {
    recovered += hit.cost;
    if (entry.used - recovered + cost <= limit) {
      return hit.at;
    }
  }
  return now;
}

/** Atomic process-local limiter; bounded storage rejects new keys rather than forgetting active quotas. */
export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const maxKeys = options.maxKeys ?? 10_000;
  assertPositive(maxKeys, "Rate limiter maxKeys");
  if (options.strategy === "token-bucket") {
    assertPositive(options.capacity, "Token bucket capacity");
    if (
      !(Number.isFinite(options.refillPerSecond) && options.refillPerSecond > 0)
    ) {
      throw new Error("Token refillPerSecond must be positive and finite");
    }
  } else {
    assertPositive(options.limit, "Rate limit allowance");
    assertPositive(options.windowMs, "Rate limit windowMs");
  }
  const cooldown = options.cooldown;
  if (cooldown) {
    assertPositive(cooldown.durationMs, "Cooldown durationMs");
    assertPositive(cooldown.maxMs ?? cooldown.durationMs, "Cooldown maxMs");
    if ((cooldown.maxMs ?? cooldown.durationMs) < cooldown.durationMs) {
      throw new Error("Cooldown maxMs must not be less than durationMs");
    }
    if (
      !(
        Number.isFinite(cooldown.multiplier ?? 1) &&
        (cooldown.multiplier ?? 1) >= 1
      )
    ) {
      throw new Error("Cooldown multiplier must be finite and at least one");
    }
  }
  const entries = new Map<string, Entry>();
  const clock = options.clock ?? (() => performance.now());
  const allowance =
    options.strategy === "token-bucket" ? options.capacity : options.limit;
  let closed = false;

  const prune = (now: number) => {
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= now) {
        entries.delete(key);
      }
    }
  };
  const deny = (
    entry: Entry,
    now: number,
    retryAfterMs: number
  ): RateLimitDecision => {
    if (cooldown) {
      entry.strikes = Math.min(30, entry.strikes + 1);
      const duration = Math.min(
        cooldown.maxMs ?? cooldown.durationMs,
        cooldown.durationMs * (cooldown.multiplier ?? 1) ** (entry.strikes - 1)
      );
      entry.blockedUntil = Math.max(entry.blockedUntil, now + duration);
      entry.expiresAt = Math.max(entry.expiresAt, entry.blockedUntil);
    }
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.ceil(Math.max(retryAfterMs, entry.blockedUntil - now)),
      reason: entry.blockedUntil > now ? "cooldown" : "quota",
    };
  };
  const applyTokens = (entry: Entry, now: number, cost: number) => {
    if (options.strategy !== "token-bucket") {
      throw new Error("Token policy required");
    }
    entry.tokens = Math.min(
      options.capacity,
      entry.tokens +
        (Math.max(0, now - entry.updatedAt) * options.refillPerSecond) / 1000
    );
    entry.updatedAt = now;
    if (entry.tokens < cost) {
      return Ok(
        deny(
          entry,
          now,
          ((cost - entry.tokens) / options.refillPerSecond) * 1000
        )
      );
    }
    entry.tokens -= cost;
    entry.expiresAt = Math.max(
      entry.blockedUntil,
      now + ((options.capacity - entry.tokens) / options.refillPerSecond) * 1000
    );
    return Ok({
      allowed: true,
      remaining: Math.floor(entry.tokens),
      retryAfterMs: 0,
    });
  };
  const applyAllowance = (entry: Entry, now: number, cost: number) => {
    if (options.strategy === "token-bucket") {
      return applyTokens(entry, now, cost);
    }

    if (options.strategy === "sliding-window") {
      entry.hits = entry.hits.filter((hit) => hit.at > now - options.windowMs);
      entry.used = entry.hits.reduce((sum, hit) => sum + hit.cost, 0);
      if (entry.used + cost > options.limit) {
        const retryAt =
          getRecoveryTime(entry, cost, options.limit, now) + options.windowMs;
        return Ok(deny(entry, now, retryAt - now));
      }
      entry.hits.push({ at: now, cost });
      entry.expiresAt = now + options.windowMs;
    } else {
      if (now >= entry.startedAt + options.windowMs) {
        entry.startedAt = now;
        entry.used = 0;
      }
      entry.expiresAt = entry.startedAt + options.windowMs;
      if (entry.used + cost > options.limit) {
        return Ok(deny(entry, now, entry.expiresAt - now));
      }
    }
    entry.used += cost;
    return Ok({
      allowed: true,
      remaining: options.limit - entry.used,
      retryAfterMs: 0,
    });
  };
  const readEntry = (key: string, now: number) => {
    let entry = entries.get(key);
    if (entry && entry.expiresAt <= now) {
      entries.delete(key);
      entry = undefined;
    }
    if (!entry) {
      if (entries.size >= maxKeys && options.eviction !== "reject-new") {
        prune(now);
      }
      if (entries.size >= maxKeys) {
        // A capacity failure is not evidence of client abuse and does not create a penalty key.
        return undefined;
      }
      entry = {
        used: 0,
        startedAt: now,
        updatedAt: now,
        tokens: allowance,
        hits: [],
        blockedUntil: 0,
        strikes: 0,
        expiresAt: now,
      };
      entries.set(key, entry);
    }
    return entry;
  };
  const consume = ({ key, cost = 1 }: RateLimitRequest) => {
    if (closed) {
      return Err("Rate limiter is closed");
    }
    if (!key || key.length > 512) {
      return Err("Rate limit key must contain 1 to 512 characters");
    }
    if (!Number.isSafeInteger(cost) || cost < 1 || cost > allowance) {
      return Err("Rate limit cost must fit within the configured allowance");
    }
    const now = clock();
    const entry = readEntry(key, now);
    if (!entry) {
      return Ok({
        allowed: false,
        remaining: 0,
        retryAfterMs: 1000,
        reason: "capacity",
      } satisfies RateLimitDecision);
    }
    if (entry.blockedUntil > now) {
      return Ok(deny(entry, now, entry.blockedUntil - now));
    }

    return applyAllowance(entry, now, cost);
  };

  return {
    consume,
    reset(key) {
      if (key === undefined) {
        entries.clear();
      } else {
        entries.delete(key);
      }
    },
    size: () => entries.size,
    close() {
      closed = true;
      entries.clear();
    },
  };
}
