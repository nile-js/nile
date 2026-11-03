---
title: "Execution options"
description: "Set a timeout for each execution and layer rate limits from the server down to one action"
---

Execution options control how long an action may run and how often it may be called. They apply to every way an action runs: HTTP, `server.invoke` and scheduled jobs. Set them under `execution` in `createNileServer`.

## When to use them

Use a timeout to stop a slow dependency from holding a request open. Use layered rate limits when one service is expensive and another should not be limited at all. A timeout undoes no work, so pair it with writes safe to repeat, or a queue.

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

The most specific policy wins. For `billing.export`, the action policy applies. For another `billing` action, the service policy applies. For any other service, the global policy applies. `false` counts as a policy: on a service it turns off the limit for every action in that service without its own policy, and an action with its own `rateLimit` keeps it.

The `key` function receives the call details. For HTTP calls, `context.clientKey` is the client's address. Use a verified user or organization identifier from the session when quotas should follow the account instead of the connection.

## How it behaves

- A timed-out execution returns a failure. Handlers that pass `context.execution.signal` to their dependencies can stop early.
- Work that ignores the signal keeps running until it finishes, and the execution stays tracked until then.
- Rate limit checks run after JWT verification and the global before hook. A call denied by the limit does not run the handler.
- Store state is per process. A shared store must check and use up the quota in one atomic step.

## Limits

- A timeout undoes no writes. Make the write safe to repeat, or move it into a queue.
- A store with `maxKeys` refuses new keys when full and keeps every client it already tracks.
- Each `rateLimit` value is a separate store unless you pass the same store object.

## Common mistakes

- Setting a timeout shorter than a legitimate database call.
- Expecting a service-level `false` to turn off a policy set on one of its actions. The action policy still applies.
- Keying on `context.clientKey` behind a proxy without forwarding the client address, so every caller shares one quota.
- Expecting a rate limit to replace authentication.

## See also

- [Production operations](/guide/reference/operations) describes timeouts, cancellation and shared quotas.
- [Rate limiting](/guide/features/rate-limiting) covers the strategies and the HTTP-level limit.
- [Retries and utilities](/guide/features/retries-and-utilities) explains helpers that cooperate with a signal.
