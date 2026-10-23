# Operating a Nile application

Nile keeps business operations in services and actions. HTTP, direct calls and WebSockets use the same engine. Schedules and function controls support background work without requiring a second application architecture.

## Call actions without HTTP

```ts
const result = await server.invoke({
  service: "orders",
  action: "create",
  payload: { name: "First order" },
});
if (result.isErr) return result;
```

This executes normal hooks, validation and configured authentication. `visibility.rpc: false` disables direct access. Backend code can supply `session`, `credentials`, `signal`, `requestId` and `clientKey`. Session data does not bypass configured JWT verification; use `credentials` for it. Nested calls inherit cancellation and correlation, but receive isolated session containers and action state. Use `context.execution` for the current ID, transport, signal and optional trace IDs. `getContext()` resolves the active execution's instance.

`rpc.enabled: false` disables the direct interface. It creates no listener or separate wire protocol; the supported API is `server.invoke`. An MCP integration can use it; a built-in MCP server is not included.

## HTTP and sockets together

Socket.IO supplies Nile’s websocket interface. Configure topics, authentication and access policies under websocket; use the dedicated client’s invoke/send/receive methods. REST and sockets share the action pipeline and listener. See [Actions and messages over Socket.IO](/guide/reference/realtime) for typed contracts, Bun/Node setup, limits, delivery semantics and schema export.

## Deploy and shut down predictably

`server.lifecycle` exposes `state()`, `isReady()`, `active()`, `register()` and `shutdown()`. Initialization completes before schedules start. With `rest.enableStatus`, `/status` is the existing health endpoint and `/ready` reports readiness.

```ts
const report = await server.lifecycle.shutdown({ timeoutMs: 10_000 });
```

Shutdown rejects new work, stops schedule admission, drains accepted executions and registered resources, then closes resources. Repeated calls share the same shutdown operation. A deadline requests cancellation; JavaScript work ignoring cancellation cannot be forcibly stopped. The report includes `timedOut`, cleanup `errors` and `remainingExecutions`.

Register resources with `name`, optional `stop`, `drain` and `close(signal)` callbacks. A stop callback should stop admission promptly, not wait for connections that need a later close phase. Application-specific database cleanup belongs in the application's callback. Nile does not install global signal handlers; connect your deployment's shutdown signal to this API. Boot failures reject startup after cleanup rather than terminating an embedding process.

## Limit requests and cancel work

HTTP protection accepts `rest.protection.maxBodyBytes` (default 10 MiB; `false` disables it). Nile checks actual bytes, including bodies with missing or inaccurate Content-Length, before JSON/form parsing. This buffers the bounded request body; configure a suitable limit for uploads or implement a custom streaming route outside this parser.

`getClientAddress(request)` supplies a listener-derived peer when using custom integrations. `trustProxy(address)` permits walking X-Forwarded-For only through trusted peers. Arbitrary forwarded headers are ignored by default. The legacy configurable rate-limiting header remains application-controlled; do not treat a client-chosen header as verified identity.

`execution.timeoutMs` requests cancellation and returns a timeout failure to the caller. Handlers can pass `context.execution.signal` to compatible dependencies. Timed-out work stays tracked until it actually finishes. Cancellation does not roll back writes or interrupt code that ignores the signal.

## Read logs, then add a destination when useful

Nile's logger keeps structured file output and readable development output. Execution IDs are attached to related logs automatically. Existing error/log IDs remain separate. `getLogs` accepts `requestId`, `runId` and `traceId` filters. Reused asynchronous file writers expose `flush` and `close` through `createLogger`; the lifecycle manages these when that logger is supplied as a resource.

```ts
const telemetry = await createNileTelemetry({
  serviceName: "shop",
  endpoint: config.observability.endpoint,
  headers: config.observability.headers,
});

// Inside createNileServer configuration:
execution: {
  diagnostics: {
    telemetry,
    summaries: false,
    slowMs: 1000,
    hookTracing: false,
  },
}
```

The destination is an OTLP HTTP base URL; Nile adds `/v1/traces` and `/v1/metrics`. Configure credentials through your application's configuration. No destination is needed to keep file logs. SDK/exporter code loads only when `createNileTelemetry` is called.

Action/job names, duration, outcome and transport produce traces and bounded-cardinality metrics. Request IDs belong on spans/logs, not metric labels. Standard incoming trace context is propagated. Hooks get detailed spans only when requested. Nile does not automatically capture payloads, tokens, raw errors or personal data. Application-written log data remains the application's responsibility.

Failures and slow executions are summarized when a logger is configured; successful summaries are opt-in. OpenTelemetry supplies implementation plumbing, not a viewer: your existing frontend can continue reading structured logs, while the configured destination stores and displays exported data. This integration does not require a Nile-hosted dashboard. Advanced exporters, metric providers, trace sampling and disabling metrics are available. SDK buffers/export deadlines are bounded, and shutdown flushes owned providers. An externally supplied metric provider remains application-owned.

## Schedule business work

```ts
schedules: {
  jobs: [
    {
      name: "billing-summary",
      schedule: { weekly: "monday", at: "09:00", timezone: "Africa/Kampala" },
      handler: async ({ signal }) => buildBillingSummary({ signal }),
    },
  ],
  onRunEvent: async (event) => recordJobEvent(event),
}
```

`recordJobEvent` and `buildBillingSummary` above are application functions. The recorder receives started/completed/failed/skipped events, job/run IDs, timestamps and completion duration. Handler return values and raw errors are not persisted automatically. Recorder failures do not fail business work; `onRecorderError(job)` can report persistence trouble. Recorder capacity and timeout are bounded; stalled writers retain their capacity slot until they settle.

Schedules support:

- `{ midnight: true, timezone: "Africa/Kampala" }`
- `{ daily: true, at: "09:00", timezone: "Africa/Kampala" }`
- `{ weekly: "monday", at: "09:00", timezone: "Africa/Kampala" }`
- `{ cron: "0 9 * * 1-5", timezone: "Africa/Kampala" }`
- `{ once: "2027-01-01T09:00:00+03:00" }`
- `{ every: "15m" }` or a millisecond number

Calendar schedules use Croner and default to UTC. One-time string dates require an offset and must be in the future at registration. Intervals are elapsed delays after completion, so slow runs do not create a backlog. Overlap is skipped. Missed runs are not replayed. `server.scheduler` exposes `inspect`, `runNow`, `start`, `stop` and `drain`. Standalone `createScheduler` registers stopped schedules.

Schedules run in every process where enabled. Recording events does not make them durable or ensure a single execution across replicas. Use a dedicated scheduler process or an external scheduler when needed. A stopped scheduler cannot restart; create a new instance. One-time jobs are not persisted across restarts.

## Control execution with ordinary functions

Factories return `run(input, { signal? })`, `stop()`, `drain()` and `close()`:

| Factory | Options and behavior |
| --- | --- |
| `createDebounce` | `task`, `waitMs`; execute the latest input after quiet, explicitly fail replaced callers. |
| `createThrottle` | `task`, `waitMs`, `leading` (true), `trailing` (false); optionally retain the latest trailing call. |
| `createQueue` | `task`, `concurrency` (1), pending `capacity` (1000); FIFO admission, no unbounded pending work. |
| `createBatch` | `task`, `size`, `waitMs`, `concurrency` (1), buffered `capacity` (1000); ordered per-item Results. |

Tasks receive `(input, signal)` and can return ordinary values or Results. Output denotes the final unwrapped value. A batch task returns one Result per input, in the same order. Configuration errors throw; expected closed/full/replaced/cancelled outcomes return failures. Cancellation settles a caller but keeps running work's concurrency slot until the task settles.

`utils.createGroupedControl({ key, create, maxKeys, idleMs? })` isolates controls by an explicit key. Group capacity is bounded. With `idleMs` configured, idle queues release their keys after accepted work actually settles; see [idle keyed queues](/guide/reference/shared-utilities#reclaim-idle-keyed-queues). `createControlResource(name, control)` registers stop/drain/close lifecycle behavior. Stop admission before draining. These queues and buffers are in memory and do not survive process termination.

## Share action quotas across interfaces

```ts
import { utils } from "@nilejs/nile";

const limiter = utils.createRateLimiter({
  strategy: "token-bucket",
  capacity: 20,
  refillPerSecond: 5,
  cooldown: { durationMs: 1000, multiplier: 2, maxMs: 30_000 },
  maxKeys: 10_000,
});

// Inside server configuration:
execution: {
  rateLimit: {
    store: limiter,
    key: ({ context }) => context.clientKey ?? "anonymous",
  },
}
```

Policies resolve from global to service to action; the most specific overrides, and `false` disables inheritance. Configure service/action overrides under `execution.services[service].rateLimit` and `.actions[action].rateLimit`. Keys run after configured authentication and the global before hook. Use verified identities from the current context when quotas should follow users or organizations.

Strategies are fixed window (`limit`, `windowMs`), exact sliding window (`limit`, `windowMs`) and token bucket (`capacity`, `refillPerSecond`). `consume({ key, cost? })` returns a Result containing `allowed`, `remaining`, `retryAfterMs` and an optional denial reason. Cooldowns are optional; repeated denials can extend a capped escalating cooldown.

The default memory store expires inactive allowances lazily and never evicts active quotas to admit new keys. At capacity it rejects new keys. `eviction: "reject-new"` disables sweeping other keys; explicitly reset/retire keys when selecting that policy. `reset(key?)` is an operator action and restores allowances. Call `close` when the application owns the limiter's lifetime.

A shared external store must atomically check and consume the full allowance through `consume`; separate get/set operations can race. No Redis/database store is supplied. Existing HTTP rate limiting remains supported independently; enabling both layers intentionally enforces both policies.

## Project structure

Nile inspects recognized source layout once during boot. Existing projects receive warnings; `project.structure` can be `"warn"`, `"error"` or `false`. New CLI projects use `"error"`. Set `project.root` to the backend package root in a monorepo. Source-less bundles skip inspection unless a root is explicitly supplied. checkProjectStructure({ root }) exposes the same Result report without starting a server.

Use `src/services/services.config.ts` and `service/actions/<action>.ts`. Larger actions can use `service/actions/<action>/<action>.ts`, `index.ts` and private `modules/`. Service-shared helpers belong in `service/modules/`. The registry stays explicit; filenames never automatically execute/register actions. Existing flat layouts remain compatible in warning mode. Action entry points above 400 lines receive refactoring guidance. Nile does not scan secrets or follow source symlinks.

The CLI generates action directories with `nile generate action <service> <action> --folder`. Schema, types and modules files should be created only when needed. No existing application is automatically moved/refactored.

## Shared backend helpers

See [Shared backend utilities](/guide/reference/shared-utilities) for safe database diagnostics, explicit jittered retries, bounded TTL storage, idle grouped queues and client-IP normalization. These helpers use the existing Slang Result conventions; retries use superPromise for cooperative deadlines and cancellable waits. Grouped controls retain keys by default; queues can opt into idle cleanup without hiding running work.
