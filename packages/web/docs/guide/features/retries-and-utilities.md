---
title: "Retries and utilities"
description: "Retry external calls with randomized backoff, keep a size-limited short-lived store, and wrap database failures safely"
---

Use `utils` for retries, size-limited stores and diagnostics. Use `safeTry` from `@nilejs/nile/fp` to catch failures from database or provider calls.

## When to use them

Use `retryFnWithJitter` when you poll a provider, or call a service that fails now and then, and the operation is safe to repeat. Use `createMemoryStore` for values that expire quickly, such as short cache entries. Use `safeTry` from `@nilejs/nile/fp` around a database call that might throw.

## Complete example

This module polls a delivery provider with up to eight attempts and a 60-second deadline. It also keeps order summaries for 30 seconds in a size-limited store.

```ts
import { utils } from "@nilejs/nile";
import { Err, Ok, type Result } from "@nilejs/nile/fp";

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
| `createMemoryStore` | A size-limited set of values with optional expiry | `maxKeys` (default 1000), `ttlMs`, `eviction` (`"reject-new"` default, or `"lru"`) |
| `safeTry` from `@nilejs/nile/fp` | Wrapping a database call that may throw | `raw` preserves the cause; use `handleError` for a safe caller message |
| `describeError` | Reading a thrown error in a diagnostic log | `maxDepth`, `maxFieldLength`, `includeMessages` |
| `createRateLimiter`, `createQueue` and others | Controls and quotas | See [queues](/guide/features/queues-debounce-throttle) and [rate limiting](/guide/features/rate-limiting) |
| `resolveClientIdentity` | Reading the client address from a request | `getClientAddress`, `trustProxy` |

## Retries

`onResult` decides what happens after each attempt. Return `retry()` to wait and try again, `end(value)` for success or `stop(message)` for a final failure. The helper returns a Result. If it runs out of attempts or time, it returns a failure with a string message.

Retry only operations safe to repeat. A payment or an email needs a key the provider uses to run it once, before a retry is safe.

## Memory store

Values are held by reference in this process. The default store refuses new keys when it is full, so a traffic spike never drops values in use. Choose `"lru"` when dropping the least recently used entry is acceptable.

`set` returns a Result. `get` returns the value or `undefined`. `consume` removes a value only when the expected value matches, which is useful for one-time tokens.

## Limits

- An attempt ignoring its abort signal runs to the end; the helper waits for it to finish.
- The store and the retry history live in memory and disappear on restart.
- `describeError` can include message text when `includeMessages` is true. Driver messages may contain data, so enable it only when you need it.

## Common mistakes

- Retrying a write which is unsafe to repeat.
- Using `safeTry` from `@nilejs/nile/fp` and then returning the raw error message to the client.
- Treating the memory store as shared between replicas.
- Forgetting the Result from `set`, which reports a rejected insert when the store is full.

## See also

- [Shared backend utilities](/guide/reference/shared-utilities) has the full reference for each helper.
- [Errors and Results](/guide/basics/errors-and-results) explains failure handling in actions.
- [Queues, debounce and throttle](/guide/features/queues-debounce-throttle) covers controlled concurrency.
