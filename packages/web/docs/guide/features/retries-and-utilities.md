---
title: "Retries and utilities"
description: "Retry external calls with jittered backoff, keep a bounded short-lived store, and wrap database failures safely"
---

Nile Js includes a few helpers for work outside the action pipeline: retries with backoff for calls to other services, a bounded in-memory store for short-lived values, and a wrapper that turns thrown database errors into safe failures. Import them from `utils` in `@nilejs/nile`.

## When to use them

Use `retryFnWithJitter` when you poll a provider or call a service that fails transiently and the operation is safe to repeat. Use `createMemoryStore` for values that expire quickly, such as short cache entries. Use `dbTry` around a database call that might throw.

## Complete example

This module polls a delivery provider with up to eight attempts and a 60-second deadline. It also keeps order summaries for 30 seconds in a bounded store.

```ts
import { utils } from "@nilejs/nile";
import { Err, Ok, type Result } from "slang-ts";

type DeliveryStatus = {
  state: "queued" | "delivered" | "failed";
};

const checkDeliveryStatus = async (
  reference: string,
  signal: AbortSignal
): Promise<Result<DeliveryStatus, string>> => {
  if (signal.aborted) {
    return Err("Cancelled");
  }
  await Promise.resolve(reference);
  return Ok({ state: "queued" });
};

/** Polls a delivery provider with jittered backoff, up to eight attempts. */
export const waitForDelivery = async (
  reference: string,
  signal: AbortSignal
): Promise<Result<DeliveryStatus, string>> => {
  const delivered = await utils.retryFnWithJitter({
    fn: (attemptSignal: AbortSignal) =>
      checkDeliveryStatus(reference, attemptSignal),
    signal: signal,
    maxAttempts: 8,
    timeoutMs: 60_000,
    baseDelayMs: 1000,
    maxDelayMs: 10_000,
    jitterMs: 500,
    onResult: ({ result, retry, end, stop }) => {
      if (result.isErr) {
        return retry();
      }
      if (result.value.state === "delivered") {
        return end(result.value);
      }
      if (result.value.state === "failed") {
        return stop("Delivery failed");
      }
      return retry();
    },
  });

  return delivered;
};

type OrderSummary = {
  orderId: string;
  total: number;
};

/** Holds up to 1000 recent summaries for 30 seconds each. */
export const summaryCache = utils.createMemoryStore<OrderSummary>({
  maxKeys: 1000,
  ttlMs: 30_000,
  eviction: "lru",
});

export const rememberSummary = (summary: OrderSummary): Result<void, string> => {
  const stored = summaryCache.set({ key: summary.orderId, value: summary });
  if (stored.isErr) {
    return Err(stored.error);
  }
  return Ok(undefined);
};
```

## Helpers

| Helper | Use it for | Notable options |
| --- | --- | --- |
| `retryFnWithJitter` | Repeating a call until its result is final | `maxAttempts` (default 10), `timeoutMs` (default 60000), `baseDelayMs`, `maxDelayMs`, `jitterMs`, `onResult`, `signal` |
| `createMemoryStore` | Bounded values with optional expiry | `maxKeys` (default 1000), `ttlMs`, `eviction` (`"reject-new"` default, or `"lru"`) |
| `dbTry` | Wrapping a database call that may throw | `message` (safe text for callers), `atFunction` |
| `describeError` | Reading a thrown error in a diagnostic log | `maxDepth`, `maxFieldLength`, `includeMessages` |
| `createRateLimiter`, `createQueue` and others | Controls and quotas | See [queues](/guide/features/queues-debounce-throttle) and [rate limiting](/guide/features/rate-limiting) |
| `resolveClientIdentity` | Reading the client address from a request | `getClientAddress`, `trustProxy` |

## Retries

`onResult` decides what happens after each attempt. Return `retry()` to wait and try again, `end(value)` for success or `stop(message)` for a final failure. The helper returns a Result. If it runs out of attempts or time, it returns a failure with a string message.

Retry only operations that are safe to repeat. A payment or an email send needs an idempotency key before a retry is safe.

## Memory store

Values are held by reference in this process. The default store rejects new keys when it is full, so an unexpected traffic spike cannot evict active values. Use LRU only when you accept evicting old entries.

`set` returns a Result. `get` returns the value or `undefined`. `consume` removes a value only when the expected value matches, which is useful for one-time tokens.

## Limits

- Retries cannot stop code that ignores its abort signal. The helper waits for the attempt to settle.
- The store and the retry history live in memory and disappear on restart.
- `describeError` can include message text when `includeMessages` is true. Driver messages may contain data, so enable it only when you need it.

## Common mistakes

- Retrying a write that is not idempotent.
- Using `dbTry` and then returning the raw error message to the client.
- Treating the memory store as shared between replicas.
- Forgetting the Result from `set`, which reports a rejected insert when the store is full.

## See also

- [Shared backend utilities](/guide/reference/shared-utilities) has the full reference for each helper.
- [Errors and Results](/guide/basics/errors-and-results) explains failure handling in actions.
- [Queues, debounce and throttle](/guide/features/queues-debounce-throttle) covers controlled concurrency.
