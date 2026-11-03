---
title: "Sockets and typed messages"
description: "Exchange validated topic messages through Socket.IO, with per-topic permissions and targeted delivery"
---

Nile keeps transport configuration under `rest`, `rpc` and `socket`. REST and sockets run together and share the server's lifecycle and JWT config. The socket carries topic messages only; actions are called over HTTP. Socket.IO provides connection handling beneath the Nile API.

## Define topics

```ts
import { createTopic, createTopics, type InferTopics } from "@nilejs/nile";
import z from "zod";

const paymentUpdated = createTopic({
  name: "payments.updated",
  data: z.object({ paymentId: z.string(), status: z.enum(["pending", "paid"]) }),
  scope: z.object({ organizationId: z.string() }),
  canReceive: ({ scope, user }) => scope.organizationId === user?.organizationId,
  canSend: ({ scope, user, data }) =>
    scope.organizationId === user?.organizationId && data.status === "pending",
});

export const topics = createTopics([paymentUpdated]);
export type Topics = InferTopics<typeof topics>;
```

`createTopic` types `scope` and `data` inside the permission checks from the schemas. `createTopics` takes a list and returns a registry keyed by topic name; a duplicate name throws. Topics without a scope schema leave `scope` out of every call. Data and parsed scope must be JSON serializable.

A message is `{ id, topic, data, scope?, time, from? }`. `time` is an ISO string. `from` is `{ connectionId, userId? }`, set by the server on messages a client sent; server messages have no `from`.

### Permissions

`canReceive(access)` and `canSend(access)` receive `{ topic, scope, user, connectionId }`. `canSend` also receives the parsed `data`. `user` is `{ userId, organizationId?, claims }`, or `undefined` for an anonymous connection.

A check must return `true`, or a promise of `true`. Any other value, a throw or a missing check denies:

- No `canReceive`: clients cannot receive the topic, with the error "Topic access is not permitted".
- No `canSend`: clients cannot send to the topic.
- Returning `false`: "Topic access denied".

Receiving never grants sending. `canReceive` runs when a client subscribes and again when it resubscribes after a reconnect. `canSend` runs on every client send, after the data passes the schema.

## Configure the backend

```ts
const server = await createNileServer({
  serverName: "shop",
  runtime: "bun",
  native: true,
  services,
  auth: { secret: config.jwtSecret },
  rest: { baseUrl: "/api", allowedOrigins: ["https://shop.example"] },
  socket: {
    topics,
    allowedOrigins: ["https://shop.example"],
    onConnect: ({ connectionId, user }) => markOnline(user, connectionId),
    onDisconnect: ({ connectionId, user, reason }) => markOffline(user, connectionId, reason),
  },
});
```

### Authentication

Without `authenticate`, connections use the server's `auth` config. Nile looks for the token in the client's `auth.token`, then in the configured auth header or cookie, and verifies it with the same secret and algorithm as protected actions:

- No token: the connection is anonymous and `user` is `undefined`.
- A valid token: `user` is `{ userId, organizationId, claims }`.
- A token that fails verification: the connection is refused.
- No `auth` config on the server: every connection is anonymous.

To identify connections another way, pass `authenticate({ request, auth })`. It returns `Ok(user)`, `Ok(undefined)` for anonymous, or `Err(reason)` to refuse. `auth` is the string-valued object the client sent; cookies and headers are on `request`. Authentication must finish within `limits.authenticationTimeoutMs`.

A JWT `exp` claim is checked on every operation and delivery. An expired connection is closed; the client reconnects with fresh `auth` and restores its subscriptions. There is no durable replay.

`onConnect` and `onDisconnect` are called with `{ connectionId, user }`; `onDisconnect` also gets the Socket.IO `reason`. A throw in either is contained and does not affect the connection.

## Backend messaging

```ts
const { socket } = getContext({ topics: topics });

// Everyone receiving this scope.
const sent = await socket.send({
  topic: "payments.updated",
  scope: { organizationId },
  data: { paymentId, status: "paid" },
});
if (sent.isErr) {
  return sent;
}

// Every connection of one user that is receiving the topic and scope.
await socket.send({ topic: "payments.updated", scope: { organizationId }, to: { userId }, data });

// One connection.
await socket.send({ topic: "payments.updated", scope: { organizationId }, to: { connectionId }, data });

// Listen on the server. Leaving out the scope of a scoped topic receives every scope.
const listening = await socket.receive({
  topic: "payments.updated",
  onMessage: (message) => audit(message.scope, message.from?.userId, message.data),
});
if (listening.isOk) {
  listening.value.unsubscribe();
}
```

`getContext({ topics })` infers types from the definitions and checks that they belong to the active Nile instance. `getContext<TDB>()` still works and returns the untyped `socket`. `server.socket` and `server.context.socket` carry the same inferred API.

Server sends are trusted: the schema is still validated, but `canSend` does not run. `to` only reaches connections that are receiving the topic and scope, so `canReceive` still decides who can get the message. Server listeners that receive every scope hear broadcasts, not messages sent with `to`. Listeners are instance-local, and one failing listener does not affect the others.

Send after a successful commit. Send success means the message was accepted for live delivery, not that every subscriber processed it. A later send failure does not roll back committed data.

## Client

```ts
import { createNileClient } from "@nilejs/client";
import type { Topics } from "./contracts";

const nile = createNileClient<Actions, Topics>({
  baseUrl: "https://api.example.com/api",
  socket: {
    auth: () => ({ token: session.token }),
    onConnect: () => setOnline(true),
    onDisconnect: () => setOnline(false),
    onReconnect: () => reloadPayments(),
    onError: ({ topic, error }) => console.warn(topic, error),
  },
});

const received = await nile.socket.receive({
  topic: "payments.updated",
  scope: { organizationId },
  onMessage: (message) => renderStatus(message.data.status),
});
if (received.isErr) {
  console.error(received.error);
  return;
}

const sent = await nile.socket.send({
  topic: "payments.updated",
  scope: { organizationId },
  data: { paymentId, status: "pending" },
});
if (sent.isErr) {
  console.error(sent.error);
}

const unsubscribed = await received.value.unsubscribe();
nile.socket.close();
```

The second type parameter of `createNileClient` is the topic contract map. Contracts can be shared from the backend with `InferTopics`, generated or written by hand. A hand-written topic is `{ data: Payload, input?: SendInput, scope?: Scope }`; without `input`, sending uses `data`. `InferTopics` keeps transformed input and output types apart automatically.

`send`, `receive` and `unsubscribe` return the same Result as the HTTP client: check `isErr`, then read `value`, or `error` on failure. A `receive` fails for an unknown topic, an invalid scope, a refused `canReceive` or a connection that could not be made.

`receive` registers a continuing listener; its Result confirms the subscription, not a first message. The subscription object has `topic` and `unsubscribe()`. Several listeners can share one server subscription; unsubscribing one keeps the others, and the server subscription ends with the last. The client keeps its listeners and resubscribes on reconnect, then calls `onReconnect`. A subscription refused while restoring goes to `onError` with its `topic`. Messages are not retried or stored for offline delivery. Calls have a finite acknowledgement timeout, which cannot prove a timed-out send was not delivered.

The socket connects on the first `send` or `receive` and loads `socket.io-client` only then. `socket.url` sets the socket server when it differs from `baseUrl`; only its origin is used, because Socket.IO reads a URL path as a namespace. Without it, the socket uses the origin of `baseUrl`, and a relative `baseUrl` such as `/api` uses the page's origin. `close()` disconnects and drops every listener; the client cannot reconnect afterwards.

## Runtime setup and limits

```ts
if (!server.socket?.bun) {
  throw new Error("Bun socket adapter unavailable");
}
const listener = Bun.serve({
  fetch: server.fetch,
  ...server.socket.bun,
});
server.lifecycle.register({ name: "listener", close: () => listener.stop(true) });
```

`server.socket.bun` is `{ websocket, idleTimeout }`, ready to spread into `Bun.serve`. Node applications select `runtime: "node"` and attach with `await server.socket.attachNode(existingHttpServer)`. Detaching and shutting down the socket keeps the application-owned HTTP listener open; closing it is up to the app. Do not attach one adapter to several listeners.

The default Socket.IO path is `/socket.io`. Set `socket.path` on the server and `socket.path` on the client together to change it. Browser origins must be explicitly allowed; an absent Origin for backend clients is not authentication.

Limits live under `socket.limits`:

| Limit | Default |
| --- | --- |
| `maxConnections` | 1000 |
| `authenticationTimeoutMs` | 5000 |
| `maxMessageBytes` | 1 MiB |
| `maxBufferedBytes` | 1 MiB |
| `maxConcurrentMessages` | 32 per connection |
| `maxSubscriptions` | 100 per connection |
| `messagesPerMinute` | 600 per connection |

Slow clients are disconnected. Socket operations take part in lifecycle admission and draining.

Delivery and subscription state are process-local. A cross-replica adapter bridge and durable event storage are not supplied. Nile uses scoped local fanout behind Socket.IO rather than exposing raw room names or adapter configuration. There is no snapshot and replay protocol: reload state from an action after `onReconnect`.

## Export contracts or retrieve them over HTTP

```ts
const schemas = await server.schema();
const written = await server.schema({ path: "./contracts/nile.schemas.json" });
```

Returns a Result with `{ services, topics }`. The destination directory must already exist. File output is a JSON Schema document, not executable TypeScript; it does not keep refinements or transforms as frontend runtime code. Conversion runs on demand, and topic conversions are cached by schema identity.

To retrieve topic schemas through `POST /api/services`, send:

```json
{"intent":"schema","service":"*","action":"*","payload":{"kind":"topics"}}
```

The REST discovery `enabled` and secret checks apply before conversion or disclosure.
