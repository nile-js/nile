---
title: "Engine"
description: "Understand action lookup, pipeline order and registration statistics"
---

The engine gives every business operation the same execution path. A team can review input checks, reusable policy and the handler without learning a different convention for each service.

## Registration

`createNileServer` creates an engine from the supplied services. Registration builds action lookups and bound executors once, records service/action counts and rejects duplicate service names or duplicate action names within a service.

Registered names identify operations. Keep meaningful domain names and action names; the engine does not infer folder structure or discover source files automatically.

## Execution order

For a successful action, the order is:

1. Configured JWT authentication for a protected action.
2. Global before hook.
3. Action before hooks, sequentially.
4. Action input validation, when supplied.
5. The action handler.
6. Action after hooks, sequentially.
7. Global after hook.

An error stops the relevant pipeline unless an action hook is explicitly noncritical. After hooks run after a successful handler; they are not a `finally` block. Referenced hook actions execute their handler, not recursively their full configured pipeline.

Before hooks run before the main action’s validation. Treat their incoming data as untrusted. The global before hook’s successful return is a continuation signal; action before-hook results form the payload passed to the next action hook and validation.

See [hooks and pipelines](/guide/basics/hooks-and-pipelines) for practical examples and failure policies.

## State boundaries

Each action execution gets isolated hook state. Hooks for that execution can share `context.hookContext.state`, including under concurrent or nested action calls. Request sessions hold the request’s identity. Neither provides persistence between requests.

Application resources and general context keys remain shared. Put a database client or logger there; do not put the current user or per-request mutable data in a global key. See [context](/guide/basics/context).

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

Direct execution bypasses HTTP parsing, CORS, transport middleware and rate limits. Authentication for protected actions still depends on configured authentication and a suitable request/session context. It is not a shortcut around access policy.

Use ordinary domain functions when composition does not need another action pipeline.

## Measuring registration

`server.engine.stats()` returns service/action registration counts and timing. `server.stats()` also includes startup duration. These are startup snapshots, not live throughput or request latency metrics. See [server setup](/guide/internals/server) and [recorded performance](/guide/reference/performance).
