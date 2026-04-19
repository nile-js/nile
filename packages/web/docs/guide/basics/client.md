# Client Side

The `@nilejs/client` package is a standalone, type-safe client for interacting with a Nile backend from any JavaScript environment (browser, server, or edge).

Nile does not dictate which frontend you use. The client works with React, Vue, Svelte, Solid, vanilla JavaScript, or any framework that can make HTTP requests. The patterns shown here use React examples, but the core `invoke`, `explore`, and `schema` methods work the same way everywhere.

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

## Usage Patterns

### Basic JavaScript / TypeScript

The simplest pattern — just call invoke and handle the result:

```typescript
// Simple async/await usage
async function createTask(title: string) {
  const { error, data } = await nile.invoke({
    service: "tasks",
    action: "create",
    payload: { title },
  });

  if (error) {
    return { success: false, error };
  }

  return { success: true, data: data?.task };
}

// Call from anywhere
const result = await createTask("My new task");
```

### With React Query / TanStack Query

Wrap the invoke call in a query hook for caching, refetching, and loading states:

```typescript
import { useQuery, useMutation } from "@tanstack/react-query";

/**
 * Fetch a list of tasks with automatic caching.
 * Uses the query key for invalidation and refetching.
 */
export function useTasks() {
  return useQuery({
    queryKey: ["tasks"],
    queryFn: async () => {
      const { error, data } = await nile.invoke({
        service: "tasks",
        action: "list",
        payload: {},
      });

      if (error) throw new Error(error);
      return data?.tasks ?? [];
    },
  });
}

/**
 * Create a task with mutation.
 * Automatically invalidates the tasks cache on success.
 */
export function useCreateTask() {
  return useMutation({
    mutationFn: async (title: string) => {
      const { error, data } = await nile.invoke({
        service: "tasks",
        action: "create",
        payload: { title },
      });

      if (error) throw new Error(error);
      return data?.task;
    },
    onSuccess: () => {
      // QueryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

// Usage in a component
function TaskList() {
  const { data: tasks, isLoading, error } = useTasks();
  const createTask = useCreateTask();

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <ul>
      {tasks?.map((task) => (
        <li key={task.id}>{task.title}</li>
      ))}
    </ul>
  );
}
```

### With Server-Side Rendering (Next.js, Remix, etc.)

Use the client on the server with the same pattern. Just ensure the base URL points to your backend:

```typescript
import { createNileClient } from "@nilejs/client";

// Server-side client with absolute URL
const serverNile = createNileClient({
  baseUrl: process.env.NILE_API_URL,
});

/**
 * Fetch data during server-side rendering or in API routes.
 * No credentials needed for server-to-server communication.
 */
export async function getUserProfile(userId: string) {
  const { error, data } = await serverNile.invoke({
    service: "users",
    action: "get-profile",
    payload: { userId },
  });

  if (error) {
    throw new Error(`Failed to fetch profile: ${error}`);
  }

  return data?.profile;
}
```

### With React Server Components

```typescript
/**
 * Direct call inside a Server Component.
 * No client-side JavaScript shipped for this data fetch.
 */
export default async function DashboardPage() {
  const { data } = await nile.invoke({
    service: "dashboard",
    action: "get-stats",
    payload: {},
  });

  return (
    <div>
      <h1>Dashboard</h1>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}
```

### Type-Safe Payloads with Generated Types

For full compile-time type checking, generate types using the Nile CLI:

```bash
npx @nilejs/cli generate schema --output ./src/generated
```

```typescript
import { createNileClient } from "@nilejs/client";
import type { ServicePayloads } from "./generated/types";

// Pass your generated types as a generic
const nile = createNileClient<ServicePayloads>({
  baseUrl: "/api",
});

// TypeScript enforces valid service names, action names, and payload shapes
await nile.invoke({
  service: "tasks",     // autocomplete from your actual services
  action: "create",     // autocomplete from actions in "tasks"
  payload: {            // type-checked against your Zod schema
    title: "Buy milk",
  },
});
```

## Discovery

Use `explore` to discover available services and actions at runtime:

```typescript
// List all services
const { data: { services } } = await nile.explore({
  service: "*",
  action: "*",
});

// List actions in a specific service
const { data: { actions } } = await nile.explore({
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
