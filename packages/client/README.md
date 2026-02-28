# @nilejs/client

A standalone, type-safe client for the [Nile](https://github.com/nile-js/nile) backend framework.

## Features

- **Type-safe:** Generates and consumes types from your Nile backend for full compile-time payload validation.
- **Graceful Error Handling:** Uses the result pattern `{ error, data }` instead of throwing exceptions.
- **Zero Runtime Dependencies:** Built on raw `fetch` for maximum compatibility (uses `slang-ts` for safety).
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
const { error, data } = await nile.invoke({
  service: "tasks",
  action: "create",
  payload: { title: "Buy milk" },
});

if (error) {
  console.error("Action failed:", error);
} else {
  console.log("Success:", data);
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
const { data: services } = await nile.explore({ service: "*", action: "*" });

// Fetch action schemas
const { data: schemas } = await nile.schema({ service: "tasks", action: "*" });
```

## API

### `createNileClient<T>(config)`

Returns a Nile client instance.

- `config.baseUrl`: The base URL of your Nile API (e.g., `http://localhost:8000/api`).
- `config.credentials`: Request credentials (`include`, `omit`, `same-origin`).
- `config.headers`: Global headers to include in every request.
- `config.timeout`: Default request timeout in milliseconds (default: 30000).

### Methods

All methods return a `Promise<ClientResult<T>>` where `ClientResult<T>` is `{ error: string | null, data: T | null }`.

- `invoke(params)`: Execute a specific service action.
- `explore(params)`: Discover services/actions using wildcards.
- `schema(params)`: Fetch action schemas as JSON Schema.

Each method accepts an optional `timeout` and any standard fetch `headers` in its parameters.

## License

MIT
