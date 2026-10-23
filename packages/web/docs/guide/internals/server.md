---
title: "Server"
description: "Configure resources, interfaces, startup and registration statistics"
---

`createNileServer` registers your application, creates context and prepares the selected HTTP adapter. It does not start a network listener. This keeps application setup separate from deployment.

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

Supply your application’s logger, database client or other long-lived resources through `resources`. Handlers and hooks receive the same application context. Nile does not open your database connection or manage its lifecycle.

Keep per-request identity in request sessions and action-specific values in hook state. General `context.set` keys are shared across requests. See [context](/guide/basics/context) and [logging](/guide/internals/logging).

## Startup work

`onBoot.fn` receives context and returns `Ok(null)` or a failed Result. The default maximum wait is 10,000 ms; customize `onBoot.maxWaitTime` when necessary. Missing required configuration, failed boot work and duplicate registration are setup failures, not user input errors.

Nile reuses its existing instance unless `forceNewInstance: true` is set. Use that option deliberately when creating isolated instances, for example in tests.

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

These timings help explain startup work as your application grows. They do not measure live requests, imported module initialization before the factory call, database latency or production capacity.

## Add policy where the team can find it

Global before/after hooks receive the application context and action metadata. Action hooks can compose reusable registered handlers with critical/noncritical failure behavior. Configure authentication explicitly and implement your application’s authorization rules. See [authentication](/guide/basics/auth) and [hooks](/guide/basics/hooks-and-pipelines).
