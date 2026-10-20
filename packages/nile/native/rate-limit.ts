import { getRequestStore } from "../nile/request-scope";
import type {
  NativeRateLimitStore,
  NativeRequestContext,
  NativeRestConfig,
} from "./types";

const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_LIMIT = 100;

/** Rotate inactive keys lazily, retaining at most two windows without background timers. */
function createMemoryStore(windowMs: number): NativeRateLimitStore {
  interface Entry {
    totalHits: number;
    resetTime: Date;
  }
  let current = new Map<string, Entry>();
  let previous = new Map<string, Entry>();
  let rotatedAt = Date.now();

  const rotate = (now: number) => {
    if (now - rotatedAt < windowMs) {
      return;
    }
    previous = now - rotatedAt >= windowMs * 2 ? new Map() : current;
    current = new Map();
    rotatedAt = now;
  };
  const get = (key: string) => {
    rotate(Date.now());
    return current.get(key) ?? previous.get(key);
  };
  return {
    get,
    increment(key) {
      const now = Date.now();
      rotate(now);
      const existing = current.get(key) ?? previous.get(key);
      const entry =
        existing && existing.resetTime.getTime() > now
          ? existing
          : { totalHits: 0, resetTime: new Date(now + windowMs) };
      previous.delete(key);
      current.set(key, entry);
      entry.totalHits++;
      return entry;
    },
    decrement(key) {
      const entry = get(key);
      if (entry) {
        entry.totalHits = Math.max(0, entry.totalHits - 1);
      }
    },
    resetKey(key) {
      current.delete(key);
      previous.delete(key);
    },
    resetAll() {
      current.clear();
      previous.clear();
    },
  };
}

/** Apply Nile's configured per-client quota before transport handlers or static assets. */
export function createNativeRateLimiter(config: NativeRestConfig) {
  const settings = config.rateLimiting;
  if (!settings?.limitingHeader) {
    return;
  }
  const windowMs = settings.windowMs ?? DEFAULT_WINDOW_MS;
  const limit = settings.limit ?? DEFAULT_LIMIT;
  const standardHeaders = settings.standardHeaders ?? true;
  if (!(Number.isFinite(windowMs) && windowMs > 0)) {
    throw new Error("Rate limiting windowMs must be a positive finite number");
  }
  if (!(Number.isSafeInteger(limit) && limit >= 0)) {
    throw new Error("Rate limiting limit must be a nonnegative safe integer");
  }
  const store = settings.store ?? createMemoryStore(windowMs);
  if (
    !(
      typeof store.increment === "function" &&
      typeof store.decrement === "function" &&
      typeof store.resetKey === "function"
    )
  ) {
    throw new Error("The rate limiting store is not correctly implemented");
  }
  store.init?.({ windowMs, limit, standardHeaders, store });

  return async (
    context: NativeRequestContext
  ): Promise<Response | undefined> => {
    const headers = context.request.headers;
    const key =
      headers.get(settings.limitingHeader) ||
      getRequestStore()?.execution?.clientKey ||
      "unknown-client";
    // Store failures propagate to the adapter's sanitized error boundary; never fail open.
    const { totalHits, resetTime } = await store.increment(key);
    if (
      !(Number.isSafeInteger(totalHits) && totalHits >= 0) ||
      (resetTime !== undefined && !Number.isFinite(resetTime.getTime()))
    ) {
      throw new Error("Rate limiting store returned invalid hit data");
    }
    const remaining = Math.max(limit - totalHits, 0);
    context.state.set("rateLimit", {
      limit,
      used: totalHits,
      remaining,
      resetTime,
    });
    context.state.set("rateLimitStore", {
      getKey: store.get?.bind(store),
      resetKey: store.resetKey.bind(store),
    });
    const resetSeconds = resetTime
      ? Math.max(0, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
      : undefined;
    if (standardHeaders) {
      context.setHeader(
        "RateLimit-Policy",
        `${limit};w=${Math.ceil(windowMs / 1000)}`
      );
      context.setHeader("RateLimit-Limit", String(limit));
      context.setHeader("RateLimit-Remaining", String(remaining));
      if (resetSeconds) {
        context.setHeader("RateLimit-Reset", String(resetSeconds));
      }
    }
    if (totalHits <= limit) {
      return;
    }
    if (standardHeaders) {
      context.setHeader(
        "Retry-After",
        String(resetSeconds ?? Math.ceil(windowMs / 1000))
      );
    }
    const responseHeaders = new Headers(context.headers);
    responseHeaders.set("Content-Type", "text/plain; charset=UTF-8");
    return new Response("Too many requests, please try again later.", {
      status: 429,
      headers: responseHeaders,
    });
  };
}
