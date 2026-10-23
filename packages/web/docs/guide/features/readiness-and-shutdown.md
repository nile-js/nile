---
title: "Readiness and shutdown"
description: "Expose readiness and liveness endpoints, then stop accepting work and drain in-flight executions on shutdown"
---

A deployment platform needs two signals from your service: whether it is ready to receive traffic, and whether it is still running. Nile Js provides both, and a shutdown call that stops new work, waits for accepted work and closes the resources you register.

## When to use it

Enable the status endpoints for any service behind a load balancer or orchestrator. Call `server.lifecycle.shutdown` when your platform sends a termination signal, so in-flight requests finish before the process exits.

## Complete example

This server enables the status endpoints, registers its HTTP listener as a lifecycle resource and shuts down on `SIGTERM`. The `onBoot` hook runs before the server reports ready.

```ts
import { createNileServer, createServices } from "@nilejs/nile";
import { Ok } from "slang-ts";

const services = createServices([
  {
    name: "health",
    description: "Service health",
    actions: [],
  },
]);

const server = await createNileServer({
  serverName: "team-workspace",
  services: services,
  rest: {
    baseUrl: "/api",
    allowedOrigins: ["https://app.example.com"],
    enableStatus: true,
  },
  onBoot: {
    maxWaitTime: 30_000,
    fn: async (context) => {
      context.set("bootedAt", new Date().toISOString());
      return Ok(null);
    },
  },
});

const native = server.nativeRest;
if (native === undefined) {
  throw new Error("Bun native transport was not initialized");
}

const listener = Bun.serve({
  port: 8000,
  fetch: native.fetch,
});

server.lifecycle.register({
  name: "http-listener",
  stop: () => {
    listener.stop(false);
  },
  close: () => {
    listener.stop(true);
  },
});

const shutdownOnSignal = async (): Promise<void> => {
  const report = await server.lifecycle.shutdown({ timeoutMs: 10_000 });
  if (report.timedOut) {
    console.error("Shutdown timed out", report.remainingExecutions);
  }
  process.exit(0);
};

process.on("SIGTERM", () => {
  void shutdownOnSignal();
});
```

## Endpoints

With `rest.enableStatus: true`, two `GET` endpoints appear outside `/api`:

| Endpoint | Use it for | Response while running | Response during shutdown |
| --- | --- | --- | --- |
| `/status` | Liveness: the process answers | `{"status":true,"message":"my-app is running","data":{}}` | Not part of the readiness contract |
| `/ready` | Readiness: the server accepts work | `{"status":true,"message":"Ready","data":{}}` with HTTP 200 | `{"status":false,"message":"Nile is shutting down","data":{}}` with HTTP 503 |

Point liveness probes at `/status` and readiness probes at `/ready`. Use readiness to take a replica out of rotation before it drains.

## Shutdown

```ts
const report = await server.lifecycle.shutdown({ timeoutMs: 10_000 });
```

Shutdown proceeds in this order:

1. New work is refused.
2. Schedules stop admitting runs.
3. Accepted executions drain. A deadline asks them to cancel.
4. Registered resources stop, drain and close.

The report contains `timedOut`, `errors` and `remainingExecutions`. In the example server, a shutdown with nothing in flight returned:

```json
{"timedOut":false,"errors":[],"remainingExecutions":0}
```

Repeated calls share one shutdown. A deadline cannot force JavaScript to stop, so work that ignores its cancellation signal may still be running when the report returns.

## Register resources

Register anything your server owns that must close in order, such as a listener, a database pool or a queue:

```ts
server.lifecycle.register({
  name: "http-listener",
  stop: () => {
    listener.stop(false);
  },
  close: () => {
    listener.stop(true);
  },
});
```

`stop` should stop accepting connections quickly. `drain` waits for work to finish, and `close` releases the resource. Register a control with `utils.createControlResource` to include a queue in the same lifecycle.

## Limits

- Nile Js does not install signal handlers. Connect `SIGTERM` or your platform's signal to `shutdown`, as the example does.
- Shutdown does not roll back writes that were already in progress.
- Startup failures reject the boot promise after cleaning up. Your process decides whether to exit.

## Common mistakes

- Exiting the process on `SIGTERM` without calling `shutdown`. In-flight requests are cut off.
- Setting a shutdown timeout longer than your platform's grace period.
- Registering a database pool without a `close` callback.
- Calling `shutdown` with a timeout longer than the grace period your platform allows.

## See also

- [Production operations](/guide/reference/operations) covers lifecycle states, cancellation and project structure.
- [Deployment](/guide/start/deploy) shows container and platform settings.
- [Getting started](/guide/start/getting-started) shows the starter's `onBoot` hook and the `/status` and `/ready` requests.
