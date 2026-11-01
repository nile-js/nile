# @nilejs/client

A type-safe frontend client for [Nile Js](https://nile-js.github.io/nile/) backends.

## Features

- **Type-safe:** Consumes shared or CLI-generated backend types for service, action and payload checking.
- **Graceful Error Handling:** Returns the same Result pattern as the Nile Js backend (`isOk`, `isErr`, `value`, `error`) instead of throwing exceptions.
- **Small:** HTTP calls use the platform `fetch`. The only runtime dependency is `socket.io-client`, for the socket client.
- **Flexible:** Supports custom headers, credentials, and timeouts per request.

## Installation

```bash
# Using npm
npm install @nilejs/client

# Using pnpm
pnpm add @nilejs/client

# Using bun
bun add @nilejs/client
```

## Usage

### 1. Create a Client

```typescript
import { createNileClient } from "@nilejs/client";

const nile = createNileClient({
  baseUrl: "http://localhost:8000/api",
  credentials: "include",
});
```

### 2. Invoke Actions

```typescript
const result = await nile.invoke({
  service: "tasks",
  action: "create",
  payload: { title: "Buy milk" },
});

if (result.isErr) {
  console.error("Action failed:", result.error);
} else {
  console.log("Success:", result.value);
}
```

### 3. Full Type Safety (Recommended)

Generate your types using the Nile CLI:
`nile generate schema --output ./src/generated`

Then use the generated `ServicePayloads` map:

```typescript
import { createNileClient } from "@nilejs/client";
import type { ServicePayloads } from "./generated/types";

const nile = createNileClient<ServicePayloads>({ 
  baseUrl: "/api" 
});

// Full autocomplete and type-checking for service, action, and payload
await nile.invoke({
  service: "tasks",
  action: "create",
  payload: { title: "Buy milk" }
});
```

### 4. Discovery & Reflection

```typescript
// Explore services and actions
const services = await nile.explore({ service: "*", action: "*" });

if (services.isOk) {
  console.log(services.value);
}

// Fetch action schemas
const schemas = await nile.schema({ service: "tasks", action: "*" });

if (schemas.isOk) {
  console.log(schemas.value);
}
```

## API

### `createNileClient<T>(config)`

Returns a Nile client instance.

- `config.baseUrl`: The base URL of your Nile API (e.g., `http://localhost:8000/api`).
- `config.credentials`: Request credentials (`include`, `omit`, `same-origin`).
- `config.headers`: Global headers to include in every request.
- `config.timeout`: Default request timeout in milliseconds (default: 30000).

### Methods

All methods return a `Promise<ClientResult<T>>`. Calls never throw:

- Success: `{ isOk: true, isErr: false, value: T, error: null, message? }`, where `message` is the server's success message for HTTP calls
- Failure: `{ isOk: false, isErr: true, value: null, error: string, details }`, where `details` holds any data the server attached, such as validation issues. Network failures and timeouts arrive as failures too.

Check `isErr` first, then read `error` or `value`. The older `data` field is still present as a deprecated alias (the value on success, `null` on failure) so existing code keeps working.

- `invoke(params)`: Execute a specific service action.
- `explore(params)`: Discover services/actions using wildcards.
- `schema(params)`: Fetch action schemas as JSON Schema.

Pass per-call settings in `fetchOptions`. Headers merge with the client’s configured headers; a per-call value overrides the same header regardless of case. Both `Headers` instances and header tuples are supported. The timeout covers reading the response body as well as connecting; an optional `signal` can cancel the call.

```ts
const controller = new AbortController();
const result = await nile.invoke({
  service: "tasks",
  action: "create",
  payload: { title: "Ship the next feature" },
  fetchOptions: {
    headers: { Authorization: "Bearer your-session-token" },
    timeout: 5000,
    signal: controller.signal,
  },
});
```

## Nile 1.0.3 responses

HTTP responses contain exactly `status`, `message` and `data`. The client maps those into its existing Result API; it preserves custom messages, Zod’s prettified validation message, and generated diagnostic references. The default success message is `Action completed.`

For a validation failure, `result.error` is the readable message and `result.details` contains `{ errorCode, issues }`. `ValidationFailureData` is exported for applications that narrow this unknown failure data. Other failures can carry different details, so check the shape before using it. Diagnostic failures may include `Error Code: <unique-code> - <message>` in the message. Treat the code as a reference to share with your backend logs; do not use it as a fixed error category.

## Socket.IO actions and topics

Create a separate socket client. It owns the connection; you do not pass a socket into each invocation. Use shared types, generated action types, or define your frontend contracts explicitly. Topic definitions and authorization policies must also be configured on the backend.

```ts
import { createNileSocketClient } from "@nilejs/client";
import type { ServicePayloads } from "./generated/types";

type Topics = {
  "tasks.changed": {
    data: { taskId: string; status: string };
  };
};

const socket = createNileSocketClient<ServicePayloads, Topics>({
  baseUrl: "http://localhost:8000",
  auth: () => {
    return { token: "your-session-token" };
  },
});

const subscription = await socket.receive({
  topic: "tasks.changed",
  onMessage: (message) => {
    console.log(message.data.taskId, message.data.status);
  },
});

const result = await socket.invoke({
  service: "tasks",
  action: "create",
  payload: { title: "Ship the next feature" },
});

const publication = await socket.send({
  topic: "tasks.changed",
  data: { taskId: "task-123", status: "done" },
});

if (subscription.isOk) {
  await subscription.value.unsubscribe();
}
socket.close();
```

Keep the client open for as long as your application needs live updates. The connection is lazy, subscriptions rejoin after reconnecting, and disconnected writes are not buffered or retried automatically. Topic names, data and any required scope are checked from the supplied types; Nile validates them and enforces policies on the backend. The server can expose HTTP and sockets together. See [WebSockets](https://nile-js.github.io/nile/guide/features/websockets/) for server setup.

## Uploads

```ts
const result = await nile.upload({
  service: "documents",
  action: "upload",
  files: { document: file },
  fields: { title: "Invoice" },
  fetchOptions: { timeout: 60000 },
});
```

Multipart calls share the same cancellation, deadline and Result behavior as JSON calls. Content-Type is set by the runtime so the multipart boundary is correct.

## Compatibility

Version 1.0.1 supports Nile 1.0.3 while keeping the existing HTTP and socket client APIs. It fixes header merging, cancellation and timeout cleanup; it does not add fields to Nile’s wire contract.

## License

MIT
