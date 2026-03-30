# Context

`NileContext` provides access to request context, session data, and shared resources throughout your application.

## Accessing Context

The context is passed as the second parameter to your action handler:

```typescript
import { Ok } from "slang-ts";
import { createAction, type Action } from "@nilejs/nile";

export const myAction: Action = createAction({
  name: "myAction",
  description: "Example action",
  handler: (data, context) => {
    // Use context here
    return Ok({ result: "success" });
  },
});
```

You can also use `getContext()` to access context from anywhere:

```typescript
import { getContext } from "@nilejs/nile";

const context = getContext();
```

## What's in Context

| Property | Type | Description |
|----------|------|-------------|
| `resources` | `Resources | undefined` | Shared resources (logger, database, cache), server-level |
| `get` / `set` | `(key: string) => T` | General-purpose key-value store. `"rest"`, `"ws"`, `"rpc"` are request-scoped via AsyncLocalStorage |
| `getSession` / `setSession` | `(name: keyof Sessions, ...) => ...` | Session access per interface, request-scoped |
| `hookContext` | `HookContext` | Lifecycle state for the current action execution |

## Accessing Resources

Resources are provided at server startup and available via context:

```typescript
handler: (data, context) => {
  const logger = context?.resources?.logger;
  
  // Access logger
  logger?.info({
    atFunction: "myAction",
    message: "Action executed",
    data: { timestamp: Date.now() },
  });
  
  // Access database (passed in server config)
  const db = context?.resources?.database;
  
  return Ok({ result: "done" });
},
```

## Session Management

Store and retrieve session data per interface:

```typescript
handler: (data, context) => {
  // Set session data
  context?.setSession("rest", { userId: "123", role: "admin" });
  
  // Get session data
  const session = context?.getSession("rest");
  console.log(session?.userId); // "123"
  
  return Ok({ session });
},
```

## Type-Safe Context

Pass a generic to get type safety for your database:

```typescript
import type { MyDatabase } from "./db";

handler: (data, context) => {
  const db = context?.resources?.database as MyDatabase | undefined;
  // db is typed as MyDatabase
  return Ok({});
}
```

## Example: Full Context Usage

```typescript
// services/users/create.ts
import { Ok, Err } from "slang-ts";
import z from "zod";
import { createAction, type Action } from "@nilejs/nile";

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});

const createUserHandler = (data: Record<string, unknown>, context) => {
  const { name, email } = data as { name: string; email: string };
  
  // Log the action
  context?.resources?.logger?.info({
    atFunction: "createUser",
    message: "Creating user",
    data: { email },
  });
  
  // Access database
  // const db = context?.resources?.database;
  // const user = await db.users.create({ name, email });
  
  const user = { id: crypto.randomUUID(), name, email };
  return Ok({ user });
};

export const createUserAction: Action = createAction({
  name: "create",
  description: "Create a new user",
  validation: createUserSchema,
  handler: createUserHandler,
});
```

## Why a Single Context?

`NileContext` is a **server-level singleton**. One instance is shared across all interfaces. But per-request data is **isolated via AsyncLocalStorage**, so concurrent requests never interfere with each other.

The design splits into two layers:

- **Server-level (shared):** `resources` (logger, database, cache) and the general-purpose `_store` map are shared across all requests. Set once at boot, available everywhere.
- **Request-level (isolated):** Interface contexts (`rest`, `ws`, `rpc`) and `sessions` are scoped per-request via `AsyncLocalStorage`. Each request gets its own `RequestStore`. Concurrent requests never see each other's Hono context or session data.

This is intentional:

- **No race conditions.** Two simultaneous REST requests won't overwrite each other's session or Hono context
- **Simplicity.** One context object, no request-scoped DI containers. Per-request isolation is handled transparently
- **Composition.** Hooks that reference other actions share the same request scope through AsyncLocalStorage continuations
- **Resource sharing.** Database connections, loggers, and caches are attached once at boot and available everywhere

```typescript
// Per-request session data, isolated via AsyncLocalStorage
handler: (data, context) => {
  const session = context?.getSession("rest");  // This request's session only
  // { userId: "usr_123", organizationId: "org_456", role: "admin", ... }
  
  return Ok({ userId: session?.userId });
},
```

## Server Configuration with Resources

Pass resources when creating the server:

```typescript
// server.ts
import { createNileServer, createLogger } from "@nilejs/nile";
import { services } from "./services";

const logger = createLogger("my-api", { mode: "prod", chunking: "monthly" });

const server = createNileServer({
  serverName: "my-app",
  services,
  resources: {
    logger,
    database: myDatabaseInstance,
  },
  rest: {
    baseUrl: "/api",
    port: 8000,
  },
});
```
