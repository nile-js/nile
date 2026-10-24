---
title: "WebSockets"
description: "Define typed topics, control who can subscribe or publish, send messages from actions and receive them in a client"
---

Nile Js sends typed messages to connected clients over Socket.IO. You define each topic with a Zod schema, decide who may subscribe and publish, and send messages from your actions after a change commits. Your frontend receives them through `@nilejs/client`.

## When to use it

Use topics when a screen should update without a refresh, such as a payment status or an order timeline. Do not use topics as a queue: delivery is live only, with no stored history and no replay after a reconnect.

## Complete example

The server file defines the topic, the access policies and an action that publishes after it changes a payment. Policies run for every subscription and every client publish. `authenticate` runs once per connection.

```ts
import {
  type Message,
  createAction,
  createNileServer,
  createServices,
  createTopics,
  getContext,
  type InferTopics,
} from "@nilejs/nile";
import { Err, Ok } from "@nilejs/nile/fp";
import { z } from "zod";

export const topics = createTopics({
  "payments.updated": {
    schema: z.object({
      paymentId: z.string(),
      status: z.enum(["pending", "paid"]),
    }),
    scope: z.object({
      organizationId: z.string(),
    }),
  },
});

export type Topics = InferTopics<typeof topics>;

const markPaidSchema = z.object({
  paymentId: z.string().min(1),
});

type MarkPaidInput = z.infer<typeof markPaidSchema>;

const markPaidHandler = async (input: MarkPaidInput) => {
  const { websocket } = getContext({ topics: topics });

  const sent = await websocket.send({
    topic: "payments.updated",
    scope: { organizationId: "org_123" },
    data: { paymentId: input.paymentId, status: "paid" },
  });

  if (sent.isErr) {
    return Err(sent.error);
  }

  return Ok({ paymentId: input.paymentId, status: "paid" });
};

const markPaidAction = createAction<MarkPaidInput>({
  name: "mark-paid",
  description: "Mark a payment as paid and notify subscribers",
  isProtected: true,
  validation: markPaidSchema,
  handler: markPaidHandler,
});

const services = createServices([
  {
    name: "payments",
    description: "Payment status",
    actions: [markPaidAction],
  },
]);

export const server = await createNileServer({
  serverName: "shop",
  runtime: "bun",
  native: true,
  services: services,
  auth: { secret: config.jwtSecret, method: "header" },
  websocket: {
    topics: topics,
    allowedOrigins: ["https://shop.example.com"],
    authenticate: (request, auth) => {
      const token = auth.token;
      if (token === undefined || token.length === 0) {
        return Err("Missing token");
      }
      return Ok({
        session: { organizationId: "org_123", userId: "user_1" },
        expiresAt: Date.now() + 60 * 60 * 1000,
      });
    },
    authorizeSubscription: ({ scope, identity }) => {
      return Ok(scope.organizationId === identity.session?.organizationId);
    },
    authorizePublish: () => Ok(false),
  },
  rest: { baseUrl: "/api", allowedOrigins: ["https://shop.example.com"] },
});

export const describeMessage = (
  message: Message<"payments.updated", Topics["payments.updated"]["data"]>
): string => {
  return `${message.data.paymentId} is ${message.data.status}`;
};
```

The `authenticate` callback in this example accepts any token and returns a fixed session. Replace it with real verification, as shown in [the realtime order example](/guide/examples/realtime-orders), before you deploy.

The client subscribes to one organization's scope and then calls the action over the same connection:

```ts
import { createNileSocketClient } from "@nilejs/client";
import type { Topics } from "./websockets";

interface PaymentActions {
  payments: {
    "mark-paid": { paymentId: string };
  };
}

const socket = createNileSocketClient<PaymentActions, Topics>({
  baseUrl: "https://shop.example.com",
  auth: () => ({ token: session.token }),
});

const received = await socket.receive({
  topic: "payments.updated",
  scope: { organizationId: organizationId },
  onMessage: (message) => {
    console.log(message.data.paymentId, message.data.status);
  },
});

if (received.isErr) {
  console.error(received.error);
} else {
  console.log("subscribed");
}

const marked = await socket.invoke({
  service: "payments",
  action: "mark-paid",
  payload: { paymentId: paymentId },
});

if (marked.isErr) {
  console.error(marked.error, marked.details);
}

socket.close();
```

## Options that matter

| Option | Purpose |
| --- | --- |
| `topics` | Topic definitions from `createTopics`. Pass the same object to `getContext({ topics })`. |
| `allowedOrigins` | Browser origins that may connect. Other browser origins are refused. |
| `path` | Socket.IO path. Default `/socket.io`. Set it on the client too. |
| `authenticate(request, auth)` | Verifies the connection and returns an identity with `session`, `credentials` and optional `expiresAt`. |
| `authorizeSubscription` | Returns `Ok(true)` to allow a subscription. Omitting it denies subscriptions to clients. |
| `authorizePublish` | Returns `Ok(true)` to allow a client to publish. Omitting it denies client publishes. |
| `maxConnections` | Connection limit. Default 1000. |
| `authenticationTimeoutMs` | Time allowed to authenticate. Default 5000. |
| `maxMessageBytes`, `maxBufferedBytes` | Message and buffer limits. Default 1 MiB. |
| `maxConcurrentMessages`, `maxSubscriptions`, `messagesPerMinute` | Per-connection limits. Defaults 32, 100 and 600. |

## How it behaves

- Authentication happens once per connection. Reconnecting refreshes it and rechecks subscriptions.
- `send` on the server validates the payload against the topic schema and delivers it to subscribers whose scope matches. It does not run your client publish policy, because server code is trusted.
- A successful `send` means the message was accepted for live delivery. It does not mean every subscriber processed it.
- Send after the database write commits. A failed send does not undo the write.
- Subscriptions, connections and delivery live in one process. Multiple replicas need an application-level bridge, which Nile Js does not supply.
- A client's `receive` registers a listener. Several listeners can share one server subscription.

## Limits

- No durable storage, replay or offline queue. A client that disconnects misses messages sent while it was away. Reload its state from an action when it reconnects.
- Protected actions called over the socket still need credentials on the connection. Put the verified headers in `credentials`.
- Scopes must be JSON values that match the topic's `scope` schema.

## Common mistakes

- Omitting `authorizeSubscription` and wondering why subscriptions fail. Omitting a policy denies by default.
- Returning `Ok(true)` from `authorizePublish` for every client. Clients could then publish any message to any scope.
- Calling `getContext()` without `{ topics }`, which loses the topic types.
- Sending a message before the database change commits.

## Server setup on Bun

Serve the Bun socket handler with the HTTP fetch handler. Read the idle timeout from `server.websocket`:

```ts
const websocketBun = server.websocket?.bun;
if (websocketBun === undefined) {
  throw new Error("Bun socket adapter is unavailable");
}

const listener = Bun.serve({
  port: 8000,
  fetch: server.fetch,
  websocket: websocketBun,
  idleTimeout: server.websocket?.idleTimeout,
});
```

## See also

- [Sockets and typed messages](/guide/reference/realtime) has the complete contract, schema export and limits.
- [HTTP, WebSocket and direct calls](/guide/features/calling-actions) shows the three ways to call an action.
- [Realtime order updates example](/guide/examples/realtime-orders) runs the full flow with two organizations.
