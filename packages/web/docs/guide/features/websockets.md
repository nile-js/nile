---
title: "WebSockets"
description: "Define typed topics with their own permissions, send messages from actions or clients, and receive them through the Nile client"
---

Nile Js sends typed messages over Socket.IO. Each topic carries its own Zod schema, optional scope and permission checks. Server code sends with `getContext().socket.send`, and the frontend sends and receives through `nile.socket` on the same `@nilejs/client` you use for actions.

## When to use it

Use topics when a screen should update without a refresh, such as a payment status, an order timeline or a chat room. Do not use topics as a queue: delivery is live only, with no stored history and no replay after a reconnect.

Actions stay on HTTP. The socket carries topic messages only.

## Complete example

The server file defines two topics, a server config and an action that sends after it changes a payment:

```ts
import {
  createAction,
  createNileServer,
  createServices,
  createTopic,
  createTopics,
  getContext,
  type InferTopics,
} from "@nilejs/nile";
import { Err, Ok } from "@nilejs/nile/fp";
import { z } from "zod";

const paymentUpdated = createTopic({
  name: "payments.updated",
  data: z.object({
    paymentId: z.string(),
    status: z.enum(["pending", "paid"]),
  }),
  scope: z.object({ organizationId: z.string() }),
  canReceive: ({ scope, user }) =>
    scope.organizationId === user?.organizationId,
});

const notice = createTopic({
  name: "notices",
  data: z.object({ text: z.string() }),
  canReceive: ({ user }) => user !== undefined,
});

export const topics = createTopics([paymentUpdated, notice]);
export type Topics = InferTopics<typeof topics>;

const markPaidSchema = z.object({
  paymentId: z.string().min(1),
  organizationId: z.string().min(1),
  payerId: z.string().min(1),
});

type MarkPaidInput = z.infer<typeof markPaidSchema>;

const markPaidHandler = async (data: MarkPaidInput) => {
  // Save the payment first, then tell the screens that show it.
  const { socket } = getContext({ topics: topics });

  const sent = await socket.send({
    topic: "payments.updated",
    scope: { organizationId: data.organizationId },
    data: { paymentId: data.paymentId, status: "paid" },
  });
  if (sent.isErr) {
    return Err(sent.error);
  }

  await socket.send({
    topic: "notices",
    to: { userId: data.payerId },
    data: { text: "Your payment went through" },
  });

  return Ok({ paymentId: data.paymentId, status: "paid" });
};

const markPaidAction = createAction({
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
  socket: {
    topics: topics,
    allowedOrigins: ["https://shop.example.com"],
  },
  rest: { baseUrl: "/api", allowedOrigins: ["https://shop.example.com"] },
});
```

Socket connections verify the same JWT as your protected actions. The `user` in a permission check is `{ userId, organizationId, claims }` from that token, or `undefined` when the client connected without one.

The client uses the same `createNileClient` you use for actions:

```ts
import { createNileClient } from "@nilejs/client";
import type { Topics } from "./websockets";

const nile = createNileClient<Actions, Topics>({
  baseUrl: "https://shop.example.com/api",
  socket: {
    auth: () => ({ token: session.token }),
    onReconnect: () => reloadPayments(),
  },
});

const received = await nile.socket.receive({
  topic: "payments.updated",
  scope: { organizationId: organizationId },
  onMessage: (message) => {
    console.log(message.data.paymentId, message.data.status);
  },
});

if (received.isErr) {
  console.error(received.error);
}

const subscription = received.value;

// Later, when the screen goes away:
await subscription?.unsubscribe();
nile.socket.close();
```

`receive` subscribes and starts listening in one call. It returns a Result, because the topic may not exist, the scope may be wrong or `canReceive` may refuse.

## Two-way topics

A topic with `canSend` accepts messages from clients. Nile validates the data against the schema, runs `canSend` with the parsed data, then delivers the message to everyone receiving that topic and scope, the sender included:

```ts
const chatMessage = createTopic({
  name: "chat.message",
  data: z.object({ text: z.string().min(1).max(2000) }),
  scope: z.object({ roomId: z.string() }),
  canReceive: ({ scope, user }) => isMember(user, scope.roomId),
  canSend: ({ scope, user }) => isMember(user, scope.roomId),
});
```

```ts
const sent = await nile.socket.send({
  topic: "chat.message",
  scope: { roomId: roomId },
  data: { text: text },
});

if (sent.isErr) {
  showError(sent.error);
}
```

A message a client sent carries `from: { connectionId, userId }`, set by the server. Server code can listen to those messages with `socket.receive`. Leave out the scope to hear every room:

```ts
const { socket } = getContext({ topics: topics });

await socket.receive({
  topic: "chat.message",
  onMessage: async (message) => {
    await saveChatMessage(message.scope, message.from?.userId, message.data.text);
  },
});
```

## Sending to one user

`to` sends a message to the connections of one user, or to one connection, instead of everyone in a scope. Those connections still need to be receiving the topic, so `canReceive` still applies:

```ts
await socket.send({ topic: "notices", to: { userId: "user_1" }, data: { text: "Hi" } });
await socket.send({ topic: "notices", to: { connectionId: connection }, data: { text: "Hi" } });
```

## Options that matter

Server, under `socket`:

| Option | Purpose |
| --- | --- |
| `topics` | Topics from `createTopics`. Pass the same object to `getContext({ topics })`. |
| `allowedOrigins` | Browser origins that may connect. Other browser origins are refused. |
| `path` | Socket.IO path. Default `/socket.io`. Set it on the client too. |
| `authenticate({ request, auth })` | Replaces the built-in JWT check. Return `Ok(user)`, `Ok(undefined)` for anonymous, or `Err` to refuse. |
| `onConnect`, `onDisconnect` | Called with `{ connectionId, user }` when a connection opens or closes. |
| `limits` | `maxConnections` (1000), `authenticationTimeoutMs` (5000), `maxMessageBytes` and `maxBufferedBytes` (1 MiB), `maxConcurrentMessages` (32), `maxSubscriptions` (100), `messagesPerMinute` (600). |

Topic, in `createTopic`:

| Option | Purpose |
| --- | --- |
| `name` | Topic name, up to 256 characters. |
| `data` | Zod schema for the message data. |
| `scope` | Optional Zod schema. Subscribers and senders must give a scope that matches. |
| `canReceive` | Returns `true` to let a client receive. Without it, clients cannot receive the topic. |
| `canSend` | Returns `true` to let a client send. Without it, clients cannot send to the topic. |

Client, under `socket` in `createNileClient`:

| Option | Purpose |
| --- | --- |
| `url` | Socket server origin when it differs from `baseUrl`. Defaults to the origin of `baseUrl`. |
| `path` | Socket.IO path. Default `/socket.io`. |
| `auth` | Sent on connect, such as `{ token }`. A function runs again on every reconnect. |
| `onConnect`, `onDisconnect`, `onReconnect`, `onError` | Connection events. `onError` also reports a subscription refused while restoring it after a reconnect. |
| `timeout` | Connection and acknowledgement timeout. Default 30000 ms. |

## How it behaves

- The client connects on its first `send` or `receive`. An app that never uses topics never opens a socket.
- Authentication happens once per connection. A token's `exp` is checked on every message, and an expired connection is closed. Reconnecting refreshes the token and restores subscriptions.
- A connection without a token is anonymous. A token that is present but invalid refuses the connection.
- `send` on the server validates the data against the topic schema. It does not run `canSend`, because server code is trusted.
- A successful `send` means the message was accepted for live delivery. It does not mean every subscriber processed it.
- Subscriptions, connections and delivery live in one process. Multiple replicas need an application-level bridge, which Nile Js does not supply.

## Common mistakes

- Leaving out `canReceive` and wondering why `receive` fails with "Topic access is not permitted". A missing check denies.
- Returning `true` from `canSend` for everyone. Any client could then send any message to any scope.
- Calling `getContext()` without `{ topics }`, which loses the topic types.
- Sending a message before the database change commits.
- Putting a path in `socket.url`. The socket connects to an origin; use `path` for a custom Socket.IO path.

## Server setup on Bun

Spread the Bun adapter into `Bun.serve` next to the HTTP fetch handler:

```ts
const socketBun = server.socket?.bun;
if (socketBun === undefined) {
  throw new Error("Bun socket adapter is unavailable");
}

const listener = Bun.serve({
  port: 8000,
  fetch: server.fetch,
  ...socketBun,
});
```

## See also

- [Sockets and typed messages](/guide/reference/realtime) has the complete contract, schema export and limits.
- [Realtime order updates example](/guide/examples/realtime-orders) runs the full flow with two organizations.
