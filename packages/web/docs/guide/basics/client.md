# Nile Client

The `@nilejs/client` package is a standalone, type-safe client for interacting with a Nile backend from any JavaScript environment (browser, server, or edge).

## Installation

```bash
bun add @nilejs/client
```

## Creating a Client

```typescript
import { createNileClient } from "@nilejs/client";

const nile = createNileClient({
  baseUrl: "http://localhost:8000/api",
  credentials: "include",
});
```

### Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `baseUrl` | `string` | *required* | Base URL of your Nile API |
| `credentials` | `"include" \| "omit" \| "same-origin"` | - | Fetch credentials mode |
| `headers` | `Record<string, string>` | - | Global headers for every request |
| `timeout` | `number` | `30000` | Default request timeout in ms |

## Invoking Actions

The primary method is `invoke`, which sends an `execute` intent to the Nile backend:

```typescript
const { error, data } = await nile.invoke({
  service: "tasks",
  action: "create",
  payload: { title: "Buy milk" },
});

if (error) {
  console.error("Failed:", error);
} else {
  console.log("Created:", data);
}
```

Every method returns a `ClientResult`:

```typescript
{
  error: string | null;  // error message, or null on success
  data: T | null;        // response data, or null on failure
}
```

This is the Result pattern. The client never throws exceptions for expected failures. Network errors, timeouts, and server validation errors are all returned in the `error` field.

## Type-Safe Payloads

For full compile-time type checking, generate types using the Nile CLI and pass them as a generic:

```bash
bun run gen schema --output ./src/generated
```

```typescript
import { createNileClient } from "@nilejs/client";
import type { ServicePayloads } from "./generated/types";

const nile = createNileClient<ServicePayloads>({
  baseUrl: "/api",
});

// TypeScript now enforces valid service names, action names, and payload shapes
await nile.invoke({
  service: "tasks",     // autocomplete from your actual services
  action: "create",     // autocomplete from actions in "tasks"
  payload: {            // type-checked against your Zod schema
    title: "Buy milk",
  },
});
```

If you pass an invalid service, action, or payload shape, TypeScript will catch it at compile time.

## Discovery

Use `explore` to discover available services and actions at runtime:

```typescript
// List all services
const { data: services } = await nile.explore({
  service: "*",
  action: "*",
});

// List actions in a specific service
const { data: actions } = await nile.explore({
  service: "tasks",
  action: "*",
});

// Get details for a specific action
const { data: details } = await nile.explore({
  service: "tasks",
  action: "create",
});
```

## Schema Retrieval

Use `schema` to fetch Zod validation schemas as JSON Schema, useful for dynamic form generation or runtime validation:

```typescript
// Get schemas for all actions in a service
const { data: schemas } = await nile.schema({
  service: "tasks",
  action: "*",
});

// Get schema for a specific action
const { data: createSchema } = await nile.schema({
  service: "tasks",
  action: "create",
});
```

## Per-Request Options

All methods accept optional `timeout` and `headers` overrides:

```typescript
const { error, data } = await nile.invoke({
  service: "tasks",
  action: "create",
  payload: { title: "Urgent task" },
  timeout: 5000,
  headers: {
    Authorization: "Bearer my-token",
  },
});
```

## Error Handling

The client handles three categories of errors:

| Category | `error` value | `data` value |
|----------|--------------|-------------|
| Network failure | Error message (e.g., `"Failed to fetch"`) | `null` |
| Timeout | `"Request timed out"` | `null` |
| Server error | Server's error message | Server's error data (if any) |
| Success | `null` | Response data |

```typescript
const { error, data } = await nile.invoke({
  service: "tasks",
  action: "create",
  payload: { title: "" }, // invalid: title is required to be non-empty
});

if (error) {
  // error = "Validation failed: title - String must contain at least 1 character(s)"
  // data may contain additional error context from the server
}
```

## How It Works

The client is a thin wrapper around `fetch` that speaks the Nile protocol:

1. All requests go to `POST {baseUrl}/services`
2. The request body contains `{ intent, service, action, payload }`
3. The response follows `{ status, message, data }`
4. The client maps this into `{ error, data }` for consumption

The client has zero runtime dependencies. It uses an internal `safeTry` utility for crash-safe async operations instead of try/catch.
