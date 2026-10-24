# @nilejs/client

A type-safe frontend client for [Nile Js](https://nile-js.github.io/nile/) backends.

## Features

- **Type-safe:** Generates and consumes types from your Nile backend for full compile-time payload validation.
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

Each method accepts an optional `timeout` and any standard fetch `headers` in its parameters.

## License

MIT
