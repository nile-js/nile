---
title: "Running Nile in production"
description: "Run direct calls, schedules, controlled work and diagnostics in production"
---

Nile keeps your operations in services and actions. HTTP calls, direct calls and schedules run through the same engine, and sockets carry typed topic messages beside them. Schedules and function controls run background work inside the same application.

## Call actions without HTTP

```ts
const result = await server.invoke({
  service: "orders",
  action: "create",
  payload: { name: "First order" },
});
if (result.isErr) {
  return result;
}
```

A direct call runs the action's hooks, validation and authentication. `visibility.rpc: false` refuses direct calls to one action. Backend code can supply `session`, `credentials`, `signal`, `requestId` and `clientKey`. A `session` leaves JWT verification in place; pass `credentials` for protected actions. Nested calls inherit the signal and request ID, and each gets its own session and action state. Use `context.execution` for the current ID, transport, signal and optional trace IDs. `getContext()` resolves the active execution's instance.

`rpc.enabled: false` turns off `server.invoke`. Direct calls open no listener and use no wire protocol, so code such as an MCP server you write can call actions through `server.invoke`.

## HTTP and sockets together

Socket.IO carries Nile’s topic messages. Configure topics and their `canReceive` and `canSend` checks under `socket`; connections verify the server `auth` JWT. The frontend sends and receives through `nile.socket` on the same client as actions, and sockets share the HTTP listener and lifecycle. See [sockets and typed messages](/guide/reference/realtime) for typed contracts, Bun and Node.js setup, limits, delivery and schema export.

## Deploy and shut down predictably

`server.lifecycle` exposes `state()`, `isReady()`, `active()`, `register()` and `shutdown()`. Initialization completes before schedules start. With `rest.enableStatus`, `/status` reports liveness and `/ready` reports readiness.

```ts
const report = await server.lifecycle.shutdown({ timeoutMs: 10_000 });
```

Shutdown refuses new work, stops starting scheduled runs, waits for accepted calls and registered resources, then closes the resources. Repeated calls share one shutdown. A deadline asks running work to cancel, and work ignoring the signal keeps running. The report includes `timedOut`, cleanup `errors` and `remainingExecutions`.

Register resources with `name`, optional `stop`, `drain` and `close(signal)` callbacks. `stop` should refuse new work quickly and leave waiting to `drain` and `close`. Your database cleanup goes in your own callback. Connect your deployment's shutdown signal to `shutdown()` yourself. A boot failure cleans up and rejects `createNileServer`, leaving the process running for you to decide.

## Limit requests and cancel work

HTTP protection accepts `rest.protection.maxBodyBytes` (default 10 MiB; `false` disables it). Nile counts the bytes actually received, whatever the Content-Length header says, before parsing JSON or forms. The body is buffered up to the limit, so raise it for large uploads, or stream them through a custom route.

Set `rest.protection.getClientAddress` to return the peer address from your listener, never from a request header. Set `rest.protection.trustProxy` to return `true` only for proxy addresses you operate. Nile reads `x-forwarded-for` only when the actual peer is trusted, and it ignores other forwarded headers by default. `utils.resolveClientIdentity(request, protection)` returns the resolved `address`, `peer` and `source`. `rest.rateLimiting.limitingHeader` names the header the HTTP rate limit keys on; a header the client can set proves nothing about who it is.

`execution.timeoutMs` requests cancellation and returns a timeout failure to the caller. Handlers can pass `context.execution.signal` to dependencies accepting one. Timed-out work counts as active until it finishes. Cancelling undoes no writes and stops only code listening to the signal.

## Read logs, then add a destination when useful

Nile's logger writes structured files in `prod` mode and readable console lines in `dev` mode. Each entry from an action carries its execution IDs, separate from its own log ID. `getLogs` accepts `requestId`, `runId` and `traceId` filters. A logger from `createLogger` has `flush` and `close`, and the lifecycle calls them when you pass the logger as a resource.

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

The destination is an OTLP HTTP base URL; Nile adds `/v1/traces` and `/v1/metrics`. Configure credentials through your application's configuration. File logs work with no destination set. The OpenTelemetry code loads only when you call `createNileTelemetry`.

Traces and metrics record action or job names, duration, outcome and transport, with a fixed set of metric labels. Request IDs go on spans and logs only. Incoming trace headers are carried through. Hooks get their own spans when you set `hookTracing`. Spans and metrics leave out payloads, tokens, raw errors and personal data; your own log data is written as you supply it.

With a logger configured, failures and slow executions are summarized; set `summaries: true` to summarize successes too. Exported data is stored and shown by your collector, such as Grafana or Honeycomb, while file logs keep working. You can supply your own exporters and metric provider, set trace sampling or turn metrics off. Export buffers and timeouts are size-limited, and shutdown flushes the providers Nile created; a metric provider you supply stays yours to close.

## Schedule work

```ts
import type { JobRunContext, JobRunEvent, SchedulerOptions } from "@nilejs/nile";

const billingSummaryJob = async (run: JobRunContext) => {
  return await buildBillingSummary({ signal: run.signal });
};

const recordRunEvent = async (event: JobRunEvent) => {
  await recordJobEvent(event);
};

export const schedules: SchedulerOptions = {
  jobs: [
    {
      name: "billing-summary",
      schedule: {
        weekly: "monday",
        at: "09:00",
        timezone: "Africa/Kampala",
      },
      handler: billingSummaryJob,
    },
  ],
  onRunEvent: recordRunEvent,
};
```

Pass `schedules` to `createNileServer`. `recordJobEvent` and `buildBillingSummary` above are application functions. The recorder receives started/completed/failed/skipped events, job/run IDs, timestamps and completion duration. Nile keeps no handler return values or raw errors; your recorder stores what you need. A failing recorder leaves the job's work alone, and `onRecorderError(job)` reports the failure. The recorder has a capacity and a timeout, and a stuck write holds its slot until it finishes.

Schedules support:

- `{ midnight: true, timezone: "Africa/Kampala" }`
- `{ daily: true, at: "09:00", timezone: "Africa/Kampala" }`
- `{ weekly: "monday", at: "09:00", timezone: "Africa/Kampala" }`
- `{ cron: "0 9 * * 1-5", timezone: "Africa/Kampala" }`
- `{ once: "2027-01-01T09:00:00+03:00" }`
- `{ every: "15m" }` or a millisecond number

Calendar schedules default to UTC. A one-time date needs an offset and must be in the future when registered. An interval counts from the end of the previous run, so slow runs never pile up. An overlapping run is skipped, and runs missed while the server was down are skipped too. `server.scheduler` exposes `inspect`, `runNow`, `start`, `stop` and `drain`. A scheduler from `createScheduler` starts stopped.

Schedules run in every process where they are enabled, so two replicas run each job twice. Run schedules in one dedicated process, or use an external scheduler, to run each job once. A stopped scheduler stays stopped; create a new instance. One-time jobs live in memory and are lost on restart.

## Control execution with ordinary functions

Factories return `run(input, { signal? })`, `stop()`, `drain()` and `close()`:

| Factory | Options and behavior |
| --- | --- |
| `createDebounce` | `task`, `waitMs`; runs the latest input once calls stop for `waitMs`, and replaced callers get a failure. |
| `createThrottle` | `task`, `waitMs`, `leading` (true), `trailing` (false); with `trailing`, the latest call in the window runs at its end. |
| `createQueue` | `task`, `concurrency` (1), pending `capacity` (1000); calls run in arrival order, and a full queue refuses new calls. |
| `createBatch` | `task`, `size`, `waitMs`, `concurrency` (1), buffered `capacity` (1000); ordered per-item Results. |

Tasks receive `(input, signal)` and return a plain value or a Result; callers get the unwrapped value. A batch task returns one Result per input, in the same order. Invalid options throw, while a closed, full, replaced or cancelled call returns a failure. A cancelled caller stops waiting at once, but running work keeps its slot until the task finishes.

`utils.createGroupedControl({ key, create, maxKeys, idleMs? })` keeps one control per key, up to `maxKeys`. With `idleMs`, a queue idle for that long frees its key once its accepted work finishes; see [idle keyed queues](/guide/reference/shared-utilities#reclaim-idle-keyed-queues). `createControlResource(name, control)` turns a control into a lifecycle resource with `stop`, `drain` and `close`. Queues and buffers live in memory and are lost when the process exits.

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

Policies resolve from global to service to action, and the most specific one applies. `false` turns off an inherited policy, while an action's own policy still applies under a service set to `false`. Configure service/action overrides under `execution.services[service].rateLimit` and `.actions[action].rateLimit`. Keys run after configured authentication and the global before hook. Use verified identities from the current context when quotas should follow users or organizations.

Strategies are fixed window (`limit`, `windowMs`), sliding window (`limit`, `windowMs`) and token bucket (`capacity`, `refillPerSecond`). `consume({ key, cost? })` returns a Result containing `allowed`, `remaining`, `retryAfterMs` and an optional denial reason. Cooldowns are optional; repeated denials can extend a capped escalating cooldown.

When the memory store is full, the default `eviction: "expired"` removes expired records to make room, never an active one, and refuses the new key if none expired. With `eviction: "reject-new"`, a full store refuses new keys without removing expired records, so reset keys yourself. `reset(key?)` restores allowances, for operator tools. Call `close` when your application owns the limiter.

A shared store you supply, such as one on Redis or your database, must check and use up the allowance in one atomic `consume`; separate get and set calls let two requests pass at once. HTTP rate limiting is configured separately, and when both are set, both apply.

## Project structure

Nile inspects the source layout once at boot. Violations fail startup by default; `project.structure` can be `"warn"`, `"error"` or `false`. Select `"warn"` to boot with warnings. CLI projects use `"error"`. Set `project.root` to the backend package root in a monorepo. Source-less bundles skip inspection unless a root is explicitly supplied. `checkProjectStructure({ root })` returns the same report as a Result without starting a server.

Use `src/services/services.config.ts` and `service/actions/<action>.ts`. Larger actions can use `service/actions/<action>/<action>.ts`, `index.ts` and private `modules/`. Service-shared helpers belong in `service/modules/`. Only the registry registers actions; a file name alone registers nothing. A flat layout boots in `"warn"` mode. Action entry points above 400 lines are reported for refactoring. The inspection skips symlinks and reads no file contents for secrets.

The CLI generates action directories with `nile generate action <service> <action> --folder`. Add schema, types and modules files only when the action needs them. The CLI never moves files in an existing application.

## Shared backend helpers

See [shared backend utilities](/guide/reference/shared-utilities) for safe database diagnostics, retries, short-lived storage, idle keyed queues and client addresses. Every helper returns Slang Results.
