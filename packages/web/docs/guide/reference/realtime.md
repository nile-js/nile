# Actions and messages over Socket.IO

Nile keeps transport configuration under rest, rpc and websocket. REST and sockets can run together; action invocations use the same validation, hooks, authentication and execution pipeline. Socket.IO provides connection handling beneath the Nile API.

## Define topic contracts

```ts
import { createTopics, type InferTopics } from "@nilejs/nile";
import z from "zod";

export const topics = createTopics({
  "payments.updated": {
    schema: z.object({ paymentId: z.string(), status: z.enum(["pending", "paid"]) }),
    scope: z.object({ organizationId: z.string() }),
  },
});
export type Topics = InferTopics<typeof topics>;
```

createTopic is an optional identity helper for individual definitions. Topics without a scope schema omit scope from calls. Topic names, schema input, parsed output and scope infer from the definitions. Data and parsed scope must be JSON serializable. An emitted Message contains id, topic, data, scope and time (ISO string).

## Configure the backend

```ts
const server = await createNileServer({
  serverName: "shop",
  runtime: "bun",
  native: true,
  services,
  rest: { baseUrl: "/api", allowedOrigins: ["https://shop.example"] },
  websocket: {
    topics,
    allowedOrigins: ["https://shop.example"],
    authenticate: (request, auth) => verifySocketSession({ request, auth }),
    authorizeSubscription: ({ scope, identity }) =>
      Ok(scope.organizationId === identity.session?.organizationId),
    authorizePublish: ({ scope, identity }) =>
      Ok(scope.organizationId === identity.session?.organizationId),
  },
});
```

verifySocketSession is application code returning Ok({ session, credentials?, clientKey?, expiresAt? }) or Err. Auth is a string-valued object supplied by the client at connection time; cookies are available on request. Authentication is separate from topic access. Both subscription and client publishing require explicit policies returning Ok(true). Omitting a publishing policy denies client send. Subscription never grants publishing permission. Topic policy callbacks receive an isolated socket session context. Policies must use verified identity, not a client-supplied organization alone.

Built-in JWT checking still applies when invoking protected actions. expiresAt is epoch milliseconds, checked on operations and event delivery. Reconnect refreshes authentication and rechecks subscriptions. There is no automatic durable replay.

## Backend messaging

```ts
await server.websocket.send({
  topic: "payments.updated",
  scope: { organizationId },
  data: { paymentId, status: "paid" },
});

// Within an action, use the existing definitions to infer the scoped context.
const { websocket } = getContext({ topics });
const sent = await websocket.send({
  topic: "payments.updated",
  scope: { organizationId },
  data: { paymentId, status: "paid" },
});
if (sent.isErr) return sent;
```

getContext({ topics }) infers from the actual definitions and verifies that they belong to the active Nile instance. No repeated payload interface or type cast is needed. Existing getContext<TDB>() remains supported. server.context.websocket also carries inferred topics. Local receive takes topic/scope/onMessage and returns a Result containing unsubscribe(). Trusted backend sends are not subjected to remote-client publishing policy; their schemas are still validated. Local listeners are instance-local, and one failed listener does not fail all other listeners.

Emit after a successful commit. Send success means accepted for live delivery, not that all subscribers processed it. A later send failure does not roll back committed data.

## Dedicated socket client

```ts
import { createNileSocketClient } from "@nilejs/client";
import type { Topics } from "./contracts";

type Actions = {
  payments: { "get-status": { paymentId: string } };
};

const socket = createNileSocketClient<Actions, Topics>({
  baseUrl: "https://api.example.com",
  auth: () => ({ token: session.token }),
});

const received = await socket.receive({
  topic: "payments.updated",
  scope: { organizationId },
  onMessage: ({ data }) => renderStatus(data.status),
});

const result = await socket.invoke({
  service: "payments",
  action: "get-status",
  payload: { paymentId },
});

const sent = await socket.send({
  topic: "payments.updated",
  scope: { organizationId },
  data: { paymentId, status: "paid" },
});

await received.data?.unsubscribe();
socket.close();
```

Client Results preserve error/data. The first type parameter is the service/action payload map; the second is the topic contract map. Contracts can be shared, generated or defined independently on the frontend. A manually defined topic member uses { data: Payload, input?: PublishInput, scope?: Scope }; when input is omitted, publishing uses data. Backend InferTopics preserves transformed input/output automatically. Topic scope and publishing input must match the backend wire contract.

receive registers a continuing listener, rather than resolving with the first message. Its Result acknowledges registration. Multiple local listeners can share a server subscription; unsubscribing one keeps the others. On reconnect the client resubscribes and reauthorizes; onSubscriptionError can report failed rejoining. Action calls and messages are not automatically retried or stored for offline delivery. Calls have a finite acknowledgement timeout, which cannot prove a timed-out write did not commit.

The client loads socket.io-client on use. Existing createNileClient remains the HTTP client. No transport or socket argument is passed per invocation. Browser-relative URLs resolve through Socket.IO's browser origin behavior; backend callers need an absolute URL.

## Runtime setup and limits

```ts
if (!server.websocket?.bun) throw new Error("Bun socket adapter unavailable");
const listener = Bun.serve({
  fetch: server.fetch,
  websocket: server.websocket.bun,
  idleTimeout: server.websocket.idleTimeout,
});
server.lifecycle.register({ name: "listener", close: () => listener.stop(true) });
```

Node applications select runtime: "node" and attach await server.websocket.attachNode(existingHttpServer). Socket detachment/shutdown preserves the application-owned HTTP listener. The app is responsible for closing that listener when desired. Do not attach one adapter to several listeners. Existing Hono-compatible HTTP apps remain supported.

The default Socket.IO path is /socket.io. Set websocket.path and the client's path together to customize it. Browser origins must be explicitly allowed; an absent Origin for backend clients is not authentication. Limits default to 1000 connections, 5s authentication, 1MiB message/buffer bounds, 32 concurrent operations per connection, 100 subscriptions per connection and 600 operations/minute. Customize through maxConnections, authenticationTimeoutMs, maxMessageBytes, maxBufferedBytes, maxConcurrentMessages, maxSubscriptions and messagesPerMinute. Slow clients are disconnected. Socket operations participate in lifecycle admission/draining.

Delivery and subscription state are process-local. A cross-replica adapter bridge and durable event persistence are not supplied. This implementation uses scoped local fanout behind Socket.IO, rather than exposing raw room names or an adapter configuration surface. There is no race-free snapshot/replay protocol: applications needing that must design cursor/snapshot semantics explicitly.

## Export contracts or retrieve them over HTTP

```ts
const schemas = await server.schema();
const written = await server.schema({ path: "./contracts/nile.schemas.json" });
```

Returns a Result with { services, topics }. The destination directory must already exist. File output is a JSON Schema document, not executable TypeScript; it does not preserve arbitrary refinements/transforms as frontend runtime code. Conversion is on demand, and topic conversions are cached by schema identity.

Existing action discovery is unchanged. To retrieve topic schemas through POST /api/services, use:

```json
{"intent":"schema","service":"*","action":"*","payload":{"kind":"topics"}}
```

The existing REST discovery enabled/secret checks apply before conversion or disclosure. No new public unauthenticated discovery route is introduced.
