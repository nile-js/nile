---
title: "Rate limiting"
description: "Limit how often a client can call an action, using a shared limiter with per-service and per-action policies"
---

Rate limiting caps how often one client can call an action. Nile Js applies the limit before the handler runs, so a client that sends a burst gets a failure instead of extra work. Limits live in memory, so each process enforces its own.

## When to use it

Use a limit on public actions that cost money or resources, such as quotes, searches or report exports. Keep authorization for who may call an action; use rate limits for how often.

## Complete example

This server allows a burst of 20 quote requests per client and refills 5 per second. The key comes from `context.clientKey`, which Nile Js derives from the connection's address.

```ts
import { createAction, createNileServer, createServices, utils } from "@nilejs/nile";
import { Ok } from "@nilejs/nile/fp";
import { z } from "zod";

const quoteSchema = z.object({
  sku: z.string().min(1),
});

type QuoteInput = z.infer<typeof quoteSchema>;

const quoteHandler = (input: QuoteInput) => {
  return Ok({ sku: input.sku, price: 1200 });
};

const quoteAction = createAction<QuoteInput>({
  name: "quote",
  description: "Return the public price of a product",
  validation: quoteSchema,
  handler: quoteHandler,
});

const services = createServices([
  {
    name: "catalog",
    description: "Public catalog",
    actions: [quoteAction],
  },
]);

/** Token bucket: a burst of 20 requests, refilled at 5 per second, per client. */
const quoteLimiter = utils.createRateLimiter({
  strategy: "token-bucket",
  capacity: 20,
  refillPerSecond: 5,
  maxKeys: 10_000,
});

export const server = await createNileServer({
  serverName: "catalog",
  services: services,
  execution: {
    rateLimit: {
      store: quoteLimiter,
      key: ({ context }) => context.clientKey ?? "anonymous",
    },
  },
  rest: {
    baseUrl: "/api",
    allowedOrigins: ["https://shop.example.com"],
    enableStatus: true,
  },
});
```

In the example project, a loop of 25 quote requests returned HTTP 200 for the first 21 and HTTP 400 for the rest:

```text
200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 400 400 400 400
```

The denied response names the wait:

```json
{
  "status": false,
  "message": "Rate limit exceeded; retry after 147ms",
  "data": {}
}
```

The 21 successes include the 20 tokens of the burst and one refill during the loop. Counts vary with timing.

## Options that matter

| Option | Effect |
| --- | --- |
| `utils.createRateLimiter` `strategy` | `"token-bucket"` with `capacity` and `refillPerSecond`; `"fixed-window"` with `limit` and `windowMs`; or `"sliding-window"` with `limit` and `windowMs`. |
| `maxKeys` | Most keys the memory store holds. At the limit, new keys are refused. |
| `execution.rateLimit` | Policy for every action. |
| `execution.services[name].rateLimit` | Policy for one service. Overrides the global policy. |
| `execution.services[name].actions[name].rateLimit` | Policy for one action. Overrides the service policy. |
| `rateLimit: false` | Turns off an inherited policy for that service or action. |
| `key` | Function that returns the client key. It receives the execution details, including the verified identity. |

Policies resolve from the most specific to the least specific. Keys are computed after JWT verification and the global before hook, so you can key on a verified user or organization.

## HTTP-level limits

`rest.rateLimiting` limits requests to the services endpoint by a header value. Use it only with a header that your proxy sets and overwrites. A client can set any header it likes, including `x-forwarded-for`, so a client-controlled header is not a verified identity. Keep this limit in place alongside the action policy when you need both.

## How it behaves

- A denied call returns a failure with the wait in the message. The handler does not run.
- Each `consume` call returns a Result with `allowed`, `remaining`, `retryAfterMs` and a reason when denied.
- Cooldowns are optional. Repeated denials can extend a capped cooldown.
- `reset(key)` restores a key's allowance. Use it from an operator tool.

## Limits

- The default store is in memory. Two replicas each allow the full quota.
- A restart clears every counter.
- A shared store must check and consume atomically. Separate read and write calls can race. Nile Js does not supply Redis or database stores.

## Common mistakes

- Keying on a client-controlled header.
- Using one limiter for every service without thinking about its cost. Give expensive actions their own policy.
- Expecting a limit to stop a determined attacker. Pair it with authentication and a proxy or firewall.
- Forgetting that `rateLimit: false` turns off inheritance for that service or action.

## See also

- [Production operations](/guide/reference/operations) describes the shared quota design and client addresses.
- [Shared utilities](/guide/reference/shared-utilities) covers client address normalization.
- [Public rate-limited quote example](/guide/examples/rate-limited-quote) runs this pattern end to end.
