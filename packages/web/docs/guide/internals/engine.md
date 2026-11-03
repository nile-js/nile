---
title: "Engine"
description: "Understand action lookup, pipeline order and registration statistics"
---

Registered actions share one execution path for authentication, hooks, validation and their handler. Configure those steps once and apply them across the service registry.

## Registration

`createNileServer` creates an engine from the supplied services. Registration builds the action lookup once, records service and action counts, and rejects duplicate service names or duplicate action names within a service.

Registered names identify operations, so choose meaningful service and action names. The engine knows only what you register, never your folders or files.

## Execution order

For a successful action, the order is:

1. Configured JWT authentication for a protected action.
2. Global before hook.
3. Action before hooks, sequentially.
4. Action input validation, when supplied.
5. The action handler.
6. Action after hooks, sequentially.
7. Global after hook.

An error stops the pipeline, except a failing action hook marked `isCritical: false`. After hooks run only after a successful handler, so put cleanup in `finally`. A referenced hook action runs only its handler, without its own pipeline.

Before hooks run before the main action’s validation. Treat their incoming data as untrusted. The global before hook's `Ok` only lets the call continue, while each action before hook's value becomes the payload for the next hook and for validation.

See [hooks and pipelines](/guide/basics/hooks-and-pipelines) for practical examples and failure policies.

## What each call keeps

Each action execution gets isolated hook state. Hooks for that execution can share `context.hookContext.state`, including under concurrent or nested action calls. Request sessions hold the request’s identity. Neither is saved between requests.

Application resources and general context keys are shared by every request. Put a database client or logger there, and keep the current user and per-request data out of them. See [context](/guide/basics/context).

## Calling the engine directly

Inside an application with a configured server and context:

```ts
const result = await server.engine.executeAction(
  "projects",
  "create",
  { name: "Customer portal" },
  server.context,
);

if (result.isErr) {
  console.error(result.error);
}
```

A direct call skips HTTP parsing, CORS, HTTP middleware and `rest.rateLimiting`. `execution.rateLimit` policies, hooks and authentication still run, so a protected action still needs credentials.

Call a domain function directly when you do not need a second action pipeline.

## Measuring registration

`server.engine.stats()` returns service/action registration counts and timing. `server.stats()` also includes startup duration. Both are startup snapshots; use [telemetry](/guide/features/telemetry) for request timings. See [server setup](/guide/internals/server) and [recorded performance](/guide/reference/performance).
