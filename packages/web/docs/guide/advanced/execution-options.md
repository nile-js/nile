---
title: "Execution options"
description: "Set a timeout for each execution and layer rate limits from the server down to one action"
---

Execution options control how long an action may run and how often it may be called. They apply to every transport: HTTP, the socket transport, `server.invoke` and scheduled jobs. Set them under `execution` in `createNileServer`.

## When to use them

Use a timeout to stop a slow dependency from holding a request open. Use layered rate limits when one service is expensive and another should not be limited at all. The timeout does not roll back work, so pair it with idempotent writes or a queue.

## Complete example

This server applies a 10-second timeout to every execution. It limits the billing service to 100 calls a minute per client, gives its export action a stricter 5-call limit, and turns off the limit for reports.

```ts
import { createNileServer, createServices, utils } from "@nilejs/nile";

const standardLimiter = utils.createRateLimiter({
  strategy: "fixed-window",
  limit: 100,
  windowMs: 60_000,
});

const reportLimiter = utils.createRateLimiter({
  strategy: "fixed-window",
  limit: 5,
  windowMs: 60_000,
});

const services = createServices([
  {
    name: "billing",
    description: "Billing operations",
    actions: [],
  },
  {
    name: "reports",
    description: "Reporting operations",
    actions: [],
  },
]);

export const server = await createNileServer({
  serverName: "back-office",
  services: services,
  execution: {
    timeoutMs: 10_000,
    rateLimit: {
      store: standardLimiter,
      key: ({ context }) => context.clientKey ?? "anonymous",
    },
    services: {
      billing: {
        rateLimit: {
          store: standardLimiter,
          key: ({ context }) => context.clientKey ?? "anonymous",
        },
        actions: {
          export: {
            rateLimit: {
              store: reportLimiter,
              key: ({ context }) => context.clientKey ?? "anonymous",
            },
          },
        },
      },
      reports: {
        rateLimit: false,
      },
    },
  },
  rest: { baseUrl: "/api", allowedOrigins: ["https://ops.example.com"] },
});
```

## Options that matter

| Option | Effect |
| --- | --- |
| `timeoutMs` | Requests cancellation after this many milliseconds and returns a timeout failure to the caller. |
| `rateLimit` | Global policy. Each policy has a `store` and a `key` function. |
| `services[name].rateLimit` | Policy for every action in a service. |
| `services[name].actions[name].rateLimit` | Policy for one action. |
| `rateLimit: false` | Turns off an inherited policy for that service or action. |
| `diagnostics` | Telemetry, summaries and slow-execution reporting. See [telemetry](/guide/features/telemetry). |

## How policies resolve

The most specific policy wins. For `billing.export`, the action policy applies. For another `billing` action, the service policy applies. For any other service, the global policy applies. `false` at any level removes the inherited policy for that level and everything below it.

The `key` function receives the execution details. Its `context.clientKey` value comes from the connection address for HTTP calls. Use a verified user or organization identifier from the session when quotas should follow the account instead of the connection.

## How it behaves

- A timed-out execution returns a failure. Handlers that pass `context.execution.signal` to their dependencies can stop early.
- Work that ignores the signal keeps running until it finishes, and the execution stays tracked until then.
- Rate limit checks run after JWT verification and the global before hook. A call denied by the limit does not run the handler.
- Store state is per process. Use a shared store only when it checks and consumes the quota atomically.

## Limits

- A timeout does not undo writes. Make the write step idempotent or move it into a queue.
- A quota with `maxKeys` refuses new keys when full, rather than evicting an active client.
- Each `rateLimit` value is a separate store unless you pass the same store object.

## Common mistakes

- Setting a timeout shorter than a legitimate database call.
- Forgetting that a service-level `false` also disables the action-level policies beneath it.
- Using `context.clientKey` behind a proxy that does not forward the real address.
- Expecting a rate limit to replace authentication.

## See also

- [Production operations](/guide/reference/operations) describes timeouts, cancellation and shared quotas.
- [Rate limiting](/guide/features/rate-limiting) covers the strategies and the HTTP-level limit.
- [Retries and utilities](/guide/features/retries-and-utilities) explains helpers that cooperate with a signal.
