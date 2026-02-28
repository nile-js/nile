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
| `rest` | `ExternalRequest \| undefined` | REST request/response context (when called via HTTP) |
| `ws` | `WebSocketContext \| undefined` | WebSocket context (when called via WS) |
| `rpc` | `RPCContext \| undefined` | RPC context (when called via RPC) |
| `sessions` | `Sessions` | Session data per interface (`rest`, `ws`, `rpc`) |
| `resources` | `Resources \| undefined` | Shared resources (logger, database, cache) |
| `logger` | `NileLogger` | Built-in logger |

## Accessing Resources

Resources are provided at server startup and available via context:

```typescript
handler: (data, context) => {
  const logger = context?.logger;
  
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
  context?.sessions.set("rest", { userId: "123", role: "admin" });
  
  // Get session data
  const session = context?.sessions.get("rest");
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
  context?.logger?.info({
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

## Server Configuration with Resources

Pass resources when creating the server:

```typescript
// server.ts
import { createNileServer, createLogger } from "@nilejs/nile";
import { services } from "./services";

const logger = createLogger("my-api", { chunking: "monthly" });

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
