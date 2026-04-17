---
name: nile
description: TypeScript-first, service and actions oriented backend framework built on Hono. Uses Zod validation, Ok/Err result pattern, and a single POST endpoint architecture.
license: MIT
---

# Nile Framework -- Agent Skill

This skill provides context for AI coding agents working with the Nile backend framework (`@nilejs/nile`).

- GitHub: https://github.com/nile-squad/nile
- Docs: https://nile-js.github.io/nile
- NPM: https://www.npmjs.com/package/@nilejs/nile

## Getting Documentation

Use the Context7 MCP tool to explore live Nile documentation:

1. Resolve the library ID: search for `@nilejs/nile`
2. Query documentation with specific questions, for example: "How do I create an action with validation?"

This package also includes bundled documentation files for offline reference:

- `docs/llms.txt` -- table of contents listing all available documentation pages
- `docs/llms-full.txt` -- full concatenated export of all framework documentation (approximately 5700 lines)

When working on a Nile project, look up these files in `node_modules/@nilejs/nile/docs/` for comprehensive reference covering all APIs, patterns, and configuration options.

## Architecture Overview

Nile uses a **single POST endpoint** architecture. Instead of mapping HTTP verbs to routes, clients send a JSON body with an `intent` field:

- `explore` -- list available services and actions (requires discovery to be enabled)
- `execute` -- run an action with a payload
- `schema` -- get JSON Schema for an action's validation (requires discovery to be enabled)

Every response follows the Result pattern: `{ status: boolean, message: string, data: object }`.

## Core Dependency: slang-ts

Nile depends on `slang-ts` for the Result pattern and error handling. All action handlers must return `Ok(data)` or `Err(message)` -- never throw for expected errors.

```typescript
import { Ok, Err, safeTry } from "slang-ts";

// Ok for success
return Ok({ id: "123", title: "Done" });

// Err for expected failures
return Err("Task not found");

// safeTry wraps async operations that might throw
const result = await safeTry(() => db.insert(table).values(data).returning());
if (result.isErr) {
  return handleError({ message: "Insert failed", data: { error: result.error } });
}
const row = result.value;
```

Always use `safeTry` instead of try/catch blocks. It returns a Result that can be checked with `result.isOk` or `result.isErr`.

## Core Concepts

### Actions

Actions are the fundamental unit of work. Each action is a plain function that takes validated data and returns a Result.

```typescript
import { Ok } from "slang-ts";
import z from "zod";
import { createAction, type Action } from "@nilejs/nile";

const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required"),
  status: z.enum(["pending", "in-progress", "done"]).default("pending"),
});

const createTaskHandler = (data: Record<string, unknown>) => {
  const task = {
    id: crypto.randomUUID(),
    title: data.title as string,
    status: (data.status as string) ?? "pending",
  };
  return Ok({ task });
};

export const createTaskAction: Action = createAction({
  name: "create",
  description: "Create a new task",
  validation: createTaskSchema,
  handler: createTaskHandler,
});
```

Actions support several options:

- `isProtected` -- when true, requires JWT authentication before the handler runs
- `visibility` -- controls whether the action appears in discovery responses: `{ rest: true, rpc: false }`
- `isSpecial` -- for file upload actions: `{ contentType: "multipart/form-data", uploadMode: "structured" }`
- `hooks` -- before/after hooks that reference other registered actions
- `accessControl` -- array of role strings for authorization checks
- `meta` -- arbitrary metadata for caching, rate limiting, or custom logic

### Services

Services group related actions. They are plain arrays of objects -- no classes.

```typescript
import { type Services } from "@nilejs/nile";
import { createTaskAction } from "./tasks/create";
import { listTasksAction } from "./tasks/list";

export const services: Services = [
  {
    name: "tasks",
    description: "Task management",
    actions: [createTaskAction, listTasksAction],
  },
];
```

### Server

`createNileServer` is the main entry point. It is async and returns a `NileServer` instance. It is a singleton -- calling it twice returns the same instance (with a warning) unless `forceNewInstance: true` is set.

```typescript
import { createNileServer } from "@nilejs/nile";
import { services } from "./services/config";
import { db } from "./db/client";
import { createLogger } from "@nilejs/nile";

const logger = createLogger("my-app", { mode: "dev" });

const server = await createNileServer({
  serverName: "my-app",
  services,
  resources: { database: db, logger },
  rest: {
    baseUrl: "/api",
    port: 8000,
    allowedOrigins: ["http://localhost:3000"],
    enableStatus: true,
  },
});

if (server.rest) {
  const { fetch } = server.rest.app;
  Bun.serve({ fetch, port: 8000 });
}
```

Key `ServerConfig` fields:

- `serverName` -- identifier for the server instance
- `services` -- array of services to register (required, at least one)
- `resources` -- shared dependencies: `{ database, logger, cache, ...any }` (available via `getContext().resources`)
- `rest` -- REST interface config (CORS, rate limiting, uploads, static files, discovery)
- `auth` -- JWT authentication config
- `diagnostics` -- enable verbose engine logging
- `logServices` -- print services table on boot (default: true)
- `forceNewInstance` -- override singleton behavior
- `onBoot` -- async lifecycle hook that runs after initialization; must return `Ok(null)` or `Err('message')`; `process.exit(1)` on failure or timeout
- `onBeforeActionHandler` / `onAfterActionHandler` -- global hooks for all actions

### Context, Store, and Sessions

`getContext()` returns the current `NileContext` from anywhere in your application. It provides:

**Global store** -- shared key-value map across all requests:

```typescript
import { getContext } from "@nilejs/nile";

const ctx = getContext();

// Write to global store
ctx.set("featureFlags", { darkMode: true });

// Read from global store
const flags = ctx.get<{ darkMode: boolean }>("featureFlags");
```

**Resources** -- shared dependencies passed via `ServerConfig.resources`:

```typescript
const ctx = getContext<typeof db>();

// Access typed database
const database = ctx.resources?.database;

// Access logger
const logger = ctx.resources?.logger;
```

`getContext` accepts a generic `TDB` for end-to-end type safety on `resources.database`.

**Request-scoped sessions** -- isolated per-request via AsyncLocalStorage (keys: `rest`, `ws`, `rpc`):

```typescript
const ctx = getContext();

// Read request-scoped session data (set automatically by auth middleware)
const session = ctx.getSession("rest");
// session?.userId, session?.organizationId, session?.claims

// Write request-scoped session data
ctx.setSession("rest", { userId: "123", role: "admin" });
```

Reading `ctx.get("rest")` also returns the request-scoped Hono context (not the global store). The keys `rest`, `ws`, and `rpc` are reserved for request-scoped data.

### Authentication

Nile provides built-in JWT verification via `hono/jwt`. Configure it on the server:

```typescript
const server = await createNileServer({
  serverName: "my-app",
  services,
  auth: {
    secret: process.env.JWT_SECRET,
    method: "header",          // "header" (default) or "cookie"
    headerName: "authorization", // default
    cookieName: "auth_token",    // used when method is "cookie"
    algorithm: "HS256",          // default, supports RS256, ES256, EdDSA, etc.
  },
  rest: { baseUrl: "/api", port: 8000, allowedOrigins: ["http://localhost:3000"] },
});
```

Mark actions as protected -- the engine verifies the JWT before the handler runs:

```typescript
export const deleteTaskAction: Action = createAction({
  name: "delete",
  description: "Delete a task",
  isProtected: true,  // requires valid JWT
  validation: z.object({ id: z.string().uuid() }),
  handler: async (data, context) => {
    const session = context?.getSession("rest");
    const userId = session?.userId as string;
    // ... delete logic using userId
    return Ok({ deleted: true });
  },
});
```

The auth result (userId, organizationId, claims) is stored on the request session and accessible via `getSession("rest")`.

For custom auth beyond JWT (RBAC, API keys, sessions), use `onBeforeActionHandler`.

### Error Handling

Use `handleError` for consistent error logging and Result returns:

```typescript
import { handleError } from "@nilejs/nile";

const findUser = async (id: string) => {
  const result = await safeTry(() => db.select().from(users).where(eq(users.id, id)));

  if (result.isErr) {
    return handleError({
      message: "Error fetching user",
      data: { id, error: result.error },
      atFunction: "findUser",
    });
  }

  const user = result.value?.[0] ?? null;
  if (!user) {
    return handleError({
      message: "User not found",
      data: { id },
      atFunction: "findUser",
    });
  }

  return Ok(user);
};
```

`handleError` resolves the logger from context (or accepts an explicit one), logs the error, and returns `Err("[logId] message")` with a traceable log ID.

### CORS Configuration

CORS is configured through `allowedOrigins` on `RestConfig` and optional fine-grained control via `cors`:

```typescript
const server = await createNileServer({
  serverName: "my-app",
  services,
  rest: {
    baseUrl: "/api",
    port: 8000,
    allowedOrigins: ["http://localhost:3000", "https://myapp.com"],
    cors: {
      enabled: true,  // true | false | "default"
      defaults: {
        credentials: true,
        allowHeaders: ["Content-Type", "Authorization"],
        allowMethods: ["POST", "GET", "OPTIONS"],
        maxAge: 600,
      },
      // Route-specific CORS rules
      addCors: [
        {
          path: "/api/public/*",
          options: { origin: "*", credentials: false },
        },
        {
          path: "/api/admin/*",
          resolver: (origin, c, cors) => {
            if (origin === "https://admin.myapp.com") {
              cors.allowOrigin(origin);
              cors.addHeaders(["X-Admin-Token"]);
            } else {
              cors.deny();
            }
          },
        },
      ],
    },
  },
});
```

The `CorsHelper` passed to resolvers uses a setter pattern:

- `cors.allowOrigin(origin)` -- allow this specific origin
- `cors.deny()` -- reject the request (no CORS headers)
- `cors.addHeaders(headers)` -- append to allowed headers
- `cors.setHeaders(headers)` -- replace allowed headers
- `cors.setMethods(methods)` -- set allowed methods
- `cors.setCredentials(value)` -- set credentials flag
- `cors.setMaxAge(seconds)` -- set preflight cache duration
- `cors.setExposeHeaders(headers)` -- set exposed headers

When no origins are configured, CORS denies all cross-origin requests by default.

### Logging

Nile uses `pino` for structured logging with time-based file chunking:

```typescript
import { createLogger, createLog, getLogs } from "@nilejs/nile";

// Create a logger bound to an app name -- mode is required
const logger = createLogger("my-app", {
  mode: "dev",       // "dev" (console), "prod" (file), or "agentic" (JSON string)
  chunking: "daily", // "none" (default), "daily", "weekly", "monthly"
});

// Use the logger
logger.info({ atFunction: "startServer", message: "Server started", data: { port: 8000 } });
logger.warn({ atFunction: "rateLimit", message: "Rate limit approaching" });
logger.error({ atFunction: "dbConnect", message: "Connection failed", data: { host: "localhost" } });

// Read logs back with filters
const errors = getLogs(
  { appName: "my-app", level: "error", from: new Date("2026-01-01") },
  { chunking: "daily" }
);
```

Mode behavior:
- `"dev"` -- prints to console with structured output
- `"prod"` -- writes NDJSON to `logs/` directory via pino
- `"agentic"` -- returns JSON string (for AI agent consumption)

Pass the logger as a resource so it is available everywhere via `getContext().resources.logger`:

```typescript
const server = await createNileServer({
  serverName: "my-app",
  services,
  resources: { logger },
  rest: { baseUrl: "/api", port: 8000, allowedOrigins: ["http://localhost:3000"] },
});
```

### Discovery

Discovery controls whether `explore` and `schema` intents are available. It is **disabled by default**.

```typescript
const server = await createNileServer({
  serverName: "my-app",
  services,
  rest: {
    baseUrl: "/api",
    port: 8000,
    allowedOrigins: ["http://localhost:3000"],
    discovery: {
      enabled: true,
      secret: "my-discovery-secret",  // optional -- when set, clients must include it
    },
  },
});
```

When a secret is configured, clients must include `discoverySecret` in the request **payload** (not a header):

```bash
curl -X POST http://localhost:8000/api/services \
  -H "Content-Type: application/json" \
  -d '{
    "intent": "explore",
    "service": "*",
    "action": "*",
    "payload": { "discoverySecret": "my-discovery-secret" }
  }'
```

Without the correct secret, explore and schema requests return 403. Without `discovery.enabled: true`, both intents are rejected entirely.

Actions can also control their discovery visibility individually:

```typescript
createAction({
  name: "internal-cleanup",
  description: "Internal cleanup task",
  visibility: { rest: false },  // hidden from explore responses
  handler: cleanupHandler,
});
```

### Hooks

Hooks intercept action execution. Per-action hooks reference other registered actions by name. Global hooks run on every action.

```typescript
// Per-action hooks
createAction({
  name: "create",
  description: "Create a task",
  handler: createHandler,
  hooks: {
    before: [{ service: "audit", action: "logAccess", isCritical: false }],
    after: [{ service: "notifications", action: "notify", isCritical: false }],
  },
});

// Global hooks on server config
await createNileServer({
  services,
  onBeforeActionHandler: ({ nileContext, action, payload }) => {
    // Auth checks, logging, rate limiting, etc.
    return Ok(payload);
  },
  onAfterActionHandler: ({ nileContext, action, payload, result }) => {
    // Transforms, auditing, analytics, etc.
    return result;
  },
});
```

Pipeline order: Global Before -> Per-Action Before (sequential) -> Zod Validation -> Handler -> Per-Action After (sequential) -> Global After -> Response.

When `isCritical` is true on a hook, failure stops the pipeline. When false, failures are logged and skipped.

### Middleware

Use `addMiddleware` on the REST app to register Hono middleware that runs before the services POST handler:

```typescript
if (server.rest) {
  server.rest.addMiddleware("*", async (c, next) => {
    const start = Date.now();
    await next();
    console.log(`${c.req.method} ${c.req.path} - ${Date.now() - start}ms`);
  });
}
```

Note: `addMiddleware` takes a path pattern as the first argument and the middleware function as the second.

### Database Utilities and Model Files

Nile provides `createModel` to eliminate CRUD boilerplate when using Drizzle ORM. A model file wraps a Drizzle table with type-safe operations.

**Schema file** (`db/schema.ts`):

```typescript
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  status: text("status").notNull().default("pending"),
  created_at: timestamp("created_at").defaultNow(),
});
```

**Model file** (`db/models/tasks.ts`):

```typescript
import { createModel } from "@nilejs/nile";
import { tasks } from "../schema";
import { db } from "../client";

// Explicit db -- resolved at creation time
export const taskModel = createModel(tasks, { db, name: "task" });

// Or context-resolved db -- resolved at call time from getContext().resources.database
export const taskModel = createModel(tasks, { name: "task" });
```

**Using the model in an action handler**:

```typescript
import { Ok, Err } from "slang-ts";
import { taskModel } from "../../db/models/tasks";

const createTaskHandler = async (data: Record<string, unknown>) => {
  const result = await taskModel.create({ data: { title: data.title as string } });
  if (result.isErr) return Err(result.error);
  return Ok({ task: result.value });
};

const listTasksHandler = async () => {
  // Offset pagination
  const page = await taskModel.findPaginated({ limit: 20, offset: 0 });
  if (page.isErr) return Err(page.error);
  return Ok(page.value);  // { items, total, hasMore }
};

const listWithCursor = async (data: Record<string, unknown>) => {
  // Cursor pagination
  const page = await taskModel.findPaginated({
    limit: 20,
    cursor: data.cursor as string,
    cursorColumn: "created_at",
  });
  if (page.isErr) return Err(page.error);
  return Ok(page.value);  // { items, nextCursor, hasMore }
};
```

`ModelOperations` returned by `createModel`:

- `create({ data, dbx? })` -- insert with auto-validation
- `createTx({ data, dbx? })` -- insert inside a transaction
- `findById(id)` -- find single record by UUID
- `update({ id, data, dbx? })` -- update with auto-validation
- `updateTx({ id, data, dbx? })` -- update inside a transaction
- `delete(id)` -- delete by UUID, returns deleted row
- `findAll()` -- get all records (ordered by `created_at` desc when available)
- `findPaginated(opts)` -- offset or cursor pagination
- `table` -- the underlying Drizzle table for custom queries
- `schemas` -- auto-generated Zod schemas (`insert`, `update`, `select`) from `drizzle-zod`

The `dbx` parameter on write methods accepts either the root db instance or a transaction pointer, enabling composable transactions across models via `createTransactionVariant`.

`getZodSchema(table)` extracts Zod schemas from any Drizzle table independently of `createModel`.

### Resource Passing

Pass shared dependencies (database, logger, cache, or anything) through `resources` on `ServerConfig`:

```typescript
import { createNileServer, createLogger, getContext } from "@nilejs/nile";
import { db } from "./db/client";
import { redis } from "./cache/client";

const logger = createLogger("my-app", { mode: "dev" });

const server = await createNileServer({
  serverName: "my-app",
  services,
  resources: {
    database: db,
    logger,
    cache: redis,
    stripe: stripeClient,  // any custom resource
  },
  rest: { baseUrl: "/api", port: 8000, allowedOrigins: ["http://localhost:3000"] },
});

// Access from anywhere
const ctx = getContext<typeof db>();
const database = ctx.resources?.database;  // typed as typeof db
const cache = ctx.resources?.cache;
const stripe = ctx.resources?.stripe;
```

The `Resources` interface extends with `[key: string]: unknown`, so any dependency can be attached.

## Code Style Rules

When writing code for a Nile project:

- **No classes, no OOP** -- use functions, factories, and composition
- **Result pattern** -- always return `Ok(data)` or `Err(message)`, never throw for expected errors
- **safeTry** -- wrap all async operations that might throw with `safeTry` from `slang-ts`
- **handleError** -- use for logging + returning Err in one step
- **Guard clauses** -- use early returns, avoid deep nesting
- **Functional style** -- prefer `.filter().map()` over for loops
- **File organization** -- group by domain (e.g., `services/tasks/create.ts`), use barrel files (`index.ts`)
- **Naming** -- `verbNoun` for functions, `isActive` for booleans, `UPPER_CASE` for constants, `kebab-case` for files
- **Max 400 lines per file** -- split large modules into focused files
- **Model files** -- one per Drizzle table at `db/models/{entity}.ts`, export the model instance

## Key Exports

| Category | Exports |
|----------|---------|
| Server | `createNileServer`, `getContext`, `NileServer`, `ServerConfig` |
| Engine | `createAction`, `createActions`, `createService`, `createServices`, `Action`, `Service`, `Services` |
| Auth | `verifyJWT`, `AuthConfig`, `AuthResult`, `TokenSource` |
| CORS | `CorsConfig`, `CorsHelper`, `CorsOptions`, `CorsResolver`, `CorsRouteRule` |
| Logging | `createLog`, `createLogger`, `getLogs`, `LoggerConfig` |
| REST | `RestConfig`, `DiscoveryConfig`, `MiddlewareEntry`, `RateLimitConfig`, `UploadsConfig` |
| Context | `NileContext`, `Resources`, `Sessions`, `NileLogger` |
| DB Utils | `createModel`, `createTransactionVariant`, `getZodSchema`, `ModelOperations`, `DBParams`, `DBX` |
| Uploads | `detectMimeType`, `handleFormDataRequest`, `validateFiles` |
| Error | `handleError` |
