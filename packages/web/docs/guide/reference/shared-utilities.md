---
title: "Shared backend utilities"
description: "Use database, retry, storage and execution helpers through the utils namespace"
---

Import Nile helpers through `utils` from `@nilejs/nile`. Use them for models, diagnostics, retries, queues and other shared application resources.

```ts
import { utils } from "@nilejs/nile";
```

| Use | Helpers |
| --- | --- |
| Database access | `createModel`, `createTransactionVariant`, `getZodSchema` |
| Failure diagnostics | `handleError`, `describeError` |
| Execution controls | `createQueue`, `createGroupedControl`, `createControlResource`, `createDebounce`, `createThrottle`, `createBatch`, `createRateLimiter` |
| Retry and storage | `retryFnWithJitter`, `createMemoryStore` |
| Client identity | `normalizeIp`, `resolveClientAddress`, `resolveClientIdentity` |

Call each helper through `utils`. Import option and result types as named exports from the package root.

## Safe database failures

```ts
import { utils } from "@nilejs/nile";
import { safeTry } from "@nilejs/nile/fp";

const loaded = await safeTry(() => db.select().from(orders));

if (loaded.isErr) {
  return utils.handleError({
    message: "Could not load orders",
    atFunction: "orders.list",
    data: { diagnostic: await utils.describeError(loaded.raw) },
  });
}
```

`safeTry` keeps the caught error on the non-enumerable `result.raw` property, for your logs only; it never appears in JSON output. `result.error` can still hold SQL or driver text, so return a message you wrote instead of passing the failure on to the caller.

Nile's model methods use `safeTry` the same way and log a short diagnostic from `result.raw`. `handleError` logs through your Nile logger, then returns the safe message with its log reference.

`describeError` leaves out messages, SQL, parameters, details and stack traces by default. Set `includeMessages: true` only for internal diagnostics, and never send `raw` to a client.

To inspect an error directly:

```ts
const diagnostic = await utils.describeError(error, {
  maxDepth: 5,
  maxFieldLength: 512,
  includeMessages: true,
});
```

Causes are listed deepest first. A chain of causes pointing back at itself, or holding odd values, is cut off safely. Invalid options throw.

## Retries and polling

```ts
import { utils } from "@nilejs/nile";

const delivered = await utils.retryFnWithJitter({
  fn: (signal) => checkDeliveryStatus({ reference, signal }),
  signal: context.execution?.signal,
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

if (delivered.isErr) {
  return delivered;
}
```

`onResult` decides after each attempt: `retry()` waits and tries again, `end(value)` returns success and `stop(message)` returns failure. Running out of attempts or time returns a failure with a string message, and a throw inside `onResult` returns a safe failure. Retry a write only when repeating it is safe.

The first attempt starts at once, unless you set `initialDelayMs`. Later attempts wait longer each time, plus a random amount, and never more than `maxDelayMs`. Every retry waits at least 1 millisecond.

| Option | Default |
| --- | --- |
| `maxAttempts` | 10 |
| `timeoutMs` (whole run) | 60 seconds |
| `baseDelayMs` | 2 seconds |
| `maxDelayMs` | 30 seconds |
| `jitterMs` | 500 milliseconds |
| `maxHistory` | 20 records, at most 1000 |

`onResult` also receives `attempt` and `attempts`, a short history of each attempt's timing and outcome; earlier payloads and errors are not kept. Pass `clock` and `random` to make timing predictable in tests.

Cancelling ends a wait at once and starts no further attempt. An attempt already running stops only if its function listens to the signal; otherwise the helper waits for it to finish, so attempts never overlap. A deadline cannot force JavaScript or a database driver to stop.

## Short-lived storage

```ts
const cache = utils.createMemoryStore<OrderSummary>({
  maxKeys: 1000,
  ttlMs: 30_000,
  eviction: "lru",
});

const stored = cache.set({ key: order.id, value: order });
if (stored.isErr) {
  return stored;
}

const cached = cache.get(order.id);
cache.delete(order.id);
```

A full store refuses new keys by default (`eviction: "reject-new"`). With `"lru"`, it drops the least recently read or written entry instead. The TTL counts from the last `set`, not the last read. Expired entries are removed as you touch the store, and reading an expired key returns `undefined`.

The store holds 1000 keys by default. Leave out `ttlMs` for values kept until you delete them; a `set` can pass its own positive `ttlMs`. A refused `set` keeps every stored value. Values are stored by reference, and `has` tells a stored `undefined` apart from a missing key.

For one-time values:

```ts
const tokens = utils.createMemoryStore<string>({ maxKeys: 1000, ttlMs: 60_000 });
tokens.set({ key: tokenId, value: expectedToken });

const accepted = tokens.consume({ key: tokenId, expected: suppliedToken });
```

`consume` deletes the value only when `expected` matches it, compared with `Object.is`, so one caller wins. The store lives in one process. `clear()` empties it, and `close()` also refuses later writes. Keep quota records and run-once claims in a `"reject-new"` store, so a full store never drops them.

## Reclaim idle keyed queues

```ts
const writes = utils.createGroupedControl({
  key: (data: SaveDraft) => data.documentId,
  maxKeys: 1000,
  idleMs: 30_000,
  create: () => utils.createQueue({
    task: saveDraft,
    concurrency: 1,
    capacity: 50,
  }),
});

const result = await writes.run(draft, { signal: signal });
server.lifecycle.register(utils.createControlResource("draft-writes", writes));
```

Each key gets its own queue, so calls for one document run one at a time while other documents proceed. When a key's queue has been idle for `idleMs`, it is closed and its key freed for reuse; a new call before then resets the timer, and a cancelled caller leaves running work alone.

`idleMs` works with queues only; a throttle or batch is refused, since closing one would flush its buffered work. Without `idleMs`, every key's queue stays until the control closes. The queues live in one process, so database constraints and locks are still yours to set.

## Client addresses

```ts
const identity = utils.resolveClientIdentity(request, {
  getClientAddress: (request) => listener.requestIP(request)?.address,
  trustProxy: (address) => config.trustedProxies.includes(address),
});

logger.info({
  atFunction: "requestIdentity",
  message: "Client address resolved",
  data: identity,
});
```

The result has `address`, the connection's `peer` address and `source`: `"peer"`, `"forwarded"` or `"unknown"`. IPv4 addresses written as IPv6 are converted to dotted IPv4. Forwarded headers are read only when `trustProxy` accepts the connection's peer, so a header alone never sets the address.

`resolveClientAddress(request, options)` returns just the address, and `normalizeIp(value)` normalizes one address. Nile uses the same resolver for `context.execution.clientKey`.

## See also

- [Model helpers](/guide/internals/db/create-model)
- [Production operations](/guide/reference/operations)
- [Logging](/guide/internals/logging)
