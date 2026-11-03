# Nile 2.0.0 migration notes

Nile 2.0.0 redesigns topics and sockets. Apps without `websocket` config need no changes. Update `@nilejs/client` to 2.0.0 alongside it.

## Server

- The config key `websocket` is now `socket`. `server.websocket` and `context.websocket` are now `server.socket` and `context.socket`, so `getContext({ topics }).websocket.send` becomes `getContext({ topics }).socket.send`.
- Topics are a list. Define each with `createTopic({ name, data, scope? })` and pass `createTopics([topicA, topicB])`. The topic's `schema` field is now `data`.
- `authorizeSubscription` and `authorizePublish` are removed. Put `canReceive` and `canSend` on each topic instead. They return a plain `true` or `false`, not `Ok(boolean)`, and receive `{ topic, scope, user, connectionId }`; `canSend` also gets the parsed `data`. A missing check still denies.
- Connections verify the server's `auth` JWT by default, reading the client's `auth.token`, the auth header or the auth cookie. A connection without a token is anonymous, and an invalid token is refused. `authenticate` is now optional and takes `({ request, auth })`. It returns `Ok(user)` with `{ userId, organizationId?, claims }`, `Ok(undefined)` for anonymous, or `Err`. `WebSocketIdentity`, `session`, `credentials`, `clientKey` and `expiresAt` are gone; expiry comes from the JWT `exp` claim.
- Sockets no longer call actions. The `nile:invoke` event and the action `visibility.ws` flag are removed. Call actions over HTTP or with `server.invoke`.
- Limits moved under `socket.limits`, with the same names and defaults.
- `server.socket.bun` is now `{ websocket, idleTimeout }`, so `Bun.serve({ fetch: server.fetch, ...server.socket.bun })`. `server.websocket.idleTimeout` is removed.
- New: `socket.send({ ..., to: { userId } })` or `to: { connectionId }` targets connections. `socket.receive` without a scope listens on every scope of a scoped topic. `onConnect` and `onDisconnect` report connections. Client-sent messages carry `from: { connectionId, userId }`.

## Client

- `createNileSocketClient` is removed. Use `createNileClient<Actions, Topics>({ baseUrl, socket: { auth } })` and `nile.socket.send`, `nile.socket.receive` and `nile.socket.close`.
- Socket `invoke` is removed; use `nile.invoke`.
- `socket.url` sets the socket server when it differs from `baseUrl`. Only its origin is used.
- `onSubscriptionError` is now `socket.onError`, which also reports connection failures. `onConnect`, `onDisconnect` and `onReconnect` are new.
- The subscription in a `receive` Result now also has `topic`.

# Nile 1.0.5 migration notes

No migration is required from 1.0.4. If updating from an earlier version, apply the notes below.

## Changes introduced in 1.0.2

This release preserves Nile's HTTP envelope: exactly `status`, `message`, and `data`.

- Slang is upgraded to 0.2.2. Import its utilities through `@nilejs/nile/fp`. Return Results directly: nested Results are rejected by Slang and contained at Nile-managed callback boundaries.
- `dbTry` and `DbTryOptions` are removed. Use `safeTry` and inspect `result.raw` internally, with `utils.describeError` for bounded diagnostics and `utils.handleError` for a safe caller message.
- Project structure violations fail startup by default. Select `project.structure: "warn"` explicitly to continue, or `false` to disable checking.
- `raw` is reserved for internal diagnostics and removed recursively from outbound JSON, including custom JSON Responses and Socket.IO messages. Rename public fields named `raw`. HTTP JSON responses are buffered to enforce filtering.
- The default success message is `Action completed.` Custom success and intentional Err messages retain their wording.
- Validation failures use Zod's prettified message or an explicitly provided validation message, with a generated unique `data.errorCode` and existing `data.issues`.
- Diagnostic errors use `Error Code: <generated-code> - <message>`, sharing the generated code with the log's `log_id`. Unexpected throws do not expose their original exception text.

Review these migration notes before updating an existing application to 1.0.2.
