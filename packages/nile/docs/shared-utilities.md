# Shared backend utilities

Nile keeps these helpers functional and independent of application models, payment providers or deployment configuration. Use the named `utils` export from `@nilejs/nile`. Framework entry points such as `createNileServer`, service/action factories and server configuration stay at the package root. Existing direct helper imports remain supported.

```ts
import { utils } from "@nilejs/nile";
```

| Use | Helpers |
| --- | --- |
| Database access | `createModel`, `createTransactionVariant`, `getZodSchema`, `dbTry` |
| Failure diagnostics | `handleError`, `describeError` |
| Execution controls | `createQueue`, `createGroupedControl`, `createControlResource`, `createDebounce`, `createThrottle`, `createBatch`, `createRateLimiter` |
| Retry and storage | `retryFnWithJitter`, `createMemoryStore` |
| Client identity | `normalizeIp`, `resolveClientAddress`, `resolveClientIdentity` |

Call each helper through `utils`. Import option and result types as named exports from the package root.

## Safe database failures

```ts
import { utils } from "@nilejs/nile";

const loaded = await utils.dbTry(() => db.select().from(orders), {
  message: "Could not load orders",
  atFunction: "orders.list",
});

if (loaded.isErr) return loaded;
```

Thrown database errors become a safe caller-facing Result. When logging succeeds, its validated log reference is included, following Nile’s existing handleError convention. Model error logs retain that reference so the diagnostic record can be found even outside a request scope. The active Nile logger receives bounded cause metadata, including driver error codes, constraints, tables and routines. An explicit `logger` overrides the current context; standalone use can omit logging. Nile's `createModel` query operations use this wrapper too. Transaction ownership, commit and rollback behavior are unchanged.

Automatic diagnostics omit messages, SQL, parameters, detail and stack traces. `includeMessages: true` explicitly enables bounded error messages for internal diagnosis; driver messages may contain application data, so choose it deliberately. Known Drizzle `Failed query:` wrappers are replaced with a generic summary even in that mode. Supplied custom public messages must be safe for callers.

Returned failures are sanitized too, and successful nested Slang Results are resolved recursively. Logger failure does not replace the operation's safe failure. Reporting follows the synchronous Nile logger contract.

To inspect an error directly:

```ts
const diagnostic = await utils.describeError(error, {
  maxDepth: 5,
  maxFieldLength: 512,
  includeMessages: true,
});
```

Causes appear deepest first. Circular causes, hostile properties and thenable causes are handled without following them indefinitely. Configuration mistakes throw. This helper does not create a separate log viewer or classify business failures automatically.

## Explicit retries and polling

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
    if (result.isErr) return retry();
    if (result.value.state === "delivered") return end(result.value);
    if (result.value.state === "failed") return stop("Delivery failed");
    return retry();
  },
});

if (delivered.isErr) return delivered;
```

Each additional attempt requires the application's explicit decision. `end(value)` returns success; `stop(message)` returns failure; reaching the attempt bound returns a string failure, without pretending it has an arbitrary application error type. Policy exceptions return a safe policy failure. Do not retry a business write unless its idempotency makes repetition appropriate.

Slang `superPromise` supplies the whole-run cooperative deadline and cancellable wait settlement. The first attempt starts immediately unless `initialDelayMs` is provided. Later attempts use exponential backoff, with jitter below the computed cap; the complete delay never exceeds `maxDelayMs`. There is at least a 1ms wait between retries so immediate failures cannot starve cancellation timers.

Defaults: 10 total attempts, 60s whole-run deadline, 2s base delay, 30s delay cap, 500ms jitter and a 20-record metadata history. `maxHistory` can be at most 1000. The policy receives `attempt`, the current Result and bounded `attempts` timing/outcome metadata. Previous payloads/errors are not retained automatically. `startedAt` uses epoch milliseconds by default; `clock` and `random` are injectable for deterministic checks.

Cancellation ends a backoff wait immediately and prevents another attempt. During in-flight work it is cooperative: if a function ignores its signal, the helper awaits actual settlement. This preserves queue concurrency accounting and never starts overlapping attempts. A deadline cannot force JavaScript or a database driver to stop. Queues and lifecycle drain can therefore still observe work that ignores cancellation.

## Bounded ephemeral storage

```ts
const cache = utils.createMemoryStore<OrderSummary>({
  maxKeys: 1000,
  ttlMs: 30_000,
  eviction: "lru",
});

const stored = cache.set({ key: order.id, value: order });
if (stored.isErr) return stored;

const cached = cache.get(order.id);
cache.delete(order.id);
```

Default admission is `reject-new`; LRU must be selected deliberately. LRU reads promote entries, while TTL is measured from the most recent set, not the most recent read. An indexed expiry queue keeps one node per expiring key: updates and deletes do not accumulate stale expiry records. Expiration is lazy, without a background timer or whole-store scan on each lookup. Capacity checks and size inspection remove due entries; reads reject an expired target immediately.

There are at most 1000 keys by default. Omit TTL for bounded values that live until removed. Each set can override the configured TTL with a positive millisecond duration. A rejected insertion preserves current live values. Values are held by reference; `has` distinguishes a stored undefined from a miss.

For one-time values:

```ts
const tokens = utils.createMemoryStore<string>({ maxKeys: 1000, ttlMs: 60_000 });
tokens.set({ key: tokenId, value: expectedToken });

const accepted = tokens.consume({ key: tokenId, expected: suppliedToken });
```

Consume is a synchronous compare-and-delete: only the matching caller consumes it. Comparison uses `Object.is`, including reference identity for objects. This is process-local, not a distributed atomic store. `clear()` empties it; `close()` also prevents future writes. Do not use LRU cache eviction for active quota records or durable idempotency claims.

## Reclaim idle keyed queues

```ts
const writes = utils.createGroupedControl({
  key: (input: SaveDraft) => input.documentId,
  maxKeys: 1000,
  idleMs: 30_000,
  create: () => utils.createQueue({
    task: saveDraft,
    concurrency: 1,
    capacity: 50,
  }),
});

const result = await writes.run(draft, { signal });
server.lifecycle.register(utils.createControlResource("draft-writes", writes));
```

Each key serializes independently. After real work becomes idle, the timer starts; a later call cancels that timer. A cancelled caller does not make still-running work idle. Idle controls are closed and their keys released, allowing capacity to be reused.

Idle cleanup requires passive `whenIdle()` support, supplied by queues. A control whose drain flushes buffered work, such as a throttle, is rejected for this option. With `idleMs` omitted, existing retention behavior remains unchanged. This protects control timing instead of silently resetting it. Serialization is process-local; database constraints/locks remain application decisions.

## Client address normalization and trust metadata

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

The result includes `address`, listener `peer` and source: `peer`, `forwarded` or `unknown`. IPv4-mapped IPv6 addresses normalize to dotted IPv4. Trust checks accept the normalized form and preserve explicit trust in the original spelling. Forwarded addresses are used only when an actual peer and explicit trust permit walking the chain; a header alone never establishes identity.

The existing `resolveClientAddress(request, options)` continues returning just the address. `normalizeIp(value)` is also available separately. The HTTP boundary uses the same resolver for execution client keys. No application config imports, fraud policy, bans or DB audit writes are built into this utility.

## Verification

The utility tests use deterministic clocks/cancellation and mock failures. The real DB fixture uses an explicitly approved disposable PGlite database under /tmp, closes it and exercises Drizzle model failures without application configuration. Run it from packages/nile in the source checkout:

```sh
bun test ./scripts/verify-db-utilities.spec.ts
```

## See also

- [Model helpers](/guide/internals/db/create-model)
- [Production operations](/guide/reference/operations)
- [Logging](/guide/internals/logging)
