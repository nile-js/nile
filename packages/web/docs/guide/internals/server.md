---
title: "Server"
description: "Configure resources, interfaces, startup and registration statistics"
---

`createNileServer` registers your services, creates context and prepares the HTTP adapter. Start the network listener with your runtime.

## Bun native

```ts
import { createNileServer } from "@nilejs/nile";
import { services } from "./services";

const server = await createNileServer({
  serverName: "Back Office",
  services,
  runtime: "bun",
  native: true,
  rest: {
    baseUrl: "/api",
    allowedOrigins: ["https://office.example.com"],
    enableStatus: true,
  },
});

const native = server.nativeRest;
if (!native) {
  throw new Error("Native transport was not initialized");
}

Bun.serve({ port: 3000, fetch: native.fetch });
```

Bun native requires explicit `runtime: "bun"`. Pass `server.nativeRest.fetch` to `Bun.serve`, as above. Applications that omit `native` use the Hono handler, `server.rest.app.fetch`, instead. See [runtime adapters](/guide/start/runtime-adapters) for listeners and migration differences.

## Shared resources

Supply your application’s logger, database client or other long-lived resources through `resources`. Handlers and hooks receive the same application context. Your application opens and closes the database connection; register it with `server.lifecycle` to close it on shutdown.

Keep per-request identity in request sessions and action-specific values in hook state. General `context.set` keys are shared across requests. See [context](/guide/basics/context) and [logging](/guide/internals/logging).

## Startup work

`onBoot.fn` receives context and returns `Ok(null)` or a failed Result. Nile waits up to 10 seconds by default; set `onBoot.maxWaitTime` for slower boot work. Missing required configuration, failed boot work and duplicate registration make `createNileServer` reject.

A second `createNileServer` call returns the existing instance unless you set `forceNewInstance: true`, for example to create isolated instances in tests.

## Understand what loaded

Nile prints service/action registration statistics by default. Disable that output with `logServices: false` and inspect the same startup measurements yourself:

```ts
console.log(server.stats());
```

The returned snapshot contains:

| Field | Meaning |
| --- | --- |
| `totalServices` | Number of registered services. |
| `totalActions` | Number of registered actions. |
| `registrationDurationMs` | Engine registration time. |
| `startupDurationMs` | Framework startup, including awaited boot work. |
| `services` | Each service’s name, description, action count and `registrationDurationMs`. |

The timings cover startup inside `createNileServer`. Module imports before the call, requests, database latency and capacity are measured elsewhere, such as with [telemetry](/guide/features/telemetry).

## Add policy where the team can find it

Global before/after hooks receive the application context and action metadata. Action hooks run other registered handlers as steps, each marked critical or noncritical. Configure authentication explicitly and implement your application’s authorization rules. See [authentication](/guide/basics/auth) and [hooks](/guide/basics/hooks-and-pipelines).
