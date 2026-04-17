# Nile Server

**Type:** Reference / Specification
**Path:** `nile/`

## 1. Purpose

The Nile Server module provides the top-level factory for bootstrapping a Nile application. `createNileServer` is the single entry point developers use to wire together the Action Engine, shared context, and interface layers (REST, and later WebSocket/RPC).

### 1.1 Responsibilities

- **Bootstrapping:** Create and connect the Action Engine, `NileContext`, and REST interface from a single `ServerConfig`
- **Context ownership:** Create a single `NileContext` instance shared across all interfaces
- **Context access:** Export `getContext()` to retrieve the runtime context from anywhere within a request scope
- **Lifecycle:** Execute `onBoot` hooks after initialization with crash safety
- **Diagnostics:** Route diagnostic output through `createDiagnosticsLog` from `utils/diagnostics-log.ts`, which checks `resources.logger` first and falls back to `console.log`. See `docs/internals/logging.md` section 7.

### 1.2 Non-Goals

- **Transport logic:** The server module does not handle HTTP routing, CORS, or request parsing. That is the REST layer's responsibility.
- **Engine internals:** The server does not manage action execution or hook pipelines. It delegates to the engine.

## 2. `createNileServer`

**Path:** `nile/server.ts`

```typescript
import { createNileServer } from "@nilejs/nile";

const server = await createNileServer({
  serverName: "my-app",
  services: [/* ... */],
  rest: {
    baseUrl: "/api",
    allowedOrigins: ["http://localhost:8000"],
    enableStatus: true,
  },
});
```

### 2.1 Initialization Sequence

1. **Validate**: Throws immediately if `config.services` is empty
2. **Create `NileContext`**: Single instance with `config.resources` attached
3. **Create Engine**: Passes `services`, `diagnostics`, and global hook handlers
4. **Log services table**: When `config.logServices` is `true`, prints a `console.table` of registered services (name, description, actions). Always prints, not gated by `diagnostics`
5. **Run `onBoot`**: If configured, awaits the boot callback inside a `Promise.race` with a configurable timeout (`maxWaitTime`, default 10s). On success, logs `Booted in Xms`. On failure or timeout, logs via diagnostics logger and calls `process.exit(1)`. The function does not return until boot completes
6. **Create REST app**: Only if `config.rest` is provided. Passes engine, context, `serverName`, and `runtime` (defaults to `"bun"`)
7. **Print REST endpoint URLs**: When REST is configured, prints `POST http://host:port/baseUrl/services` and optionally `GET http://host:port/status` via `console.log`. Uses `rest.host` (default `"localhost"`) and `rest.port` (default `8000`)

### 2.2 Return Value (`NileServer`)

```typescript
{
  config: ServerConfig;
  engine: Engine;
  context: NileContext;
  rest?: {
    app: Hono;
    config: RestConfig;
    addMiddleware: (path: string, fn: (c: HonoContext, next: () => Promise<void>) => Promise<void | Response>) => void;
  };
}
```

- `rest` is only present when `config.rest` was provided
- `engine` provides direct access to `getServices`, `getServiceActions`, `getAction`, `executeAction`
- `context` is the shared `NileContext` passed to all layers
- `addMiddleware` registers middleware that runs before the services POST handler. Middleware is executed in registration order via a dynamic runner. A middleware can return a `Response` to short-circuit the request (skipping downstream middleware and the handler).

## 3. `ServerConfig`

```typescript
{
  serverName: string;
  runtime?: ServerRuntime;            // "bun" | "node", defaults to "bun"
  services: Services;                 // required, at least one
  diagnostics?: boolean;              // default: false
  logServices?: boolean;              // default: true, print services table via console.table
  resources?: Resources;              // logger, database, cache, custom keys
  rest?: RestConfig;
  websocket?: Record<string, unknown>; // placeholder, not yet implemented
  rpc?: Record<string, unknown>;       // placeholder, not yet implemented
  onBeforeActionHandler?: BeforeActionHandler<unknown, unknown>;
  onAfterActionHandler?: AfterActionHandler<unknown, unknown>;
  onBoot?: {
    fn: (context: NileContext) => Promise<Result<null, string>> | Result<null, string>;
    maxWaitTime?: number;               // default: 10000 (10s)
  };
  forceNewInstance?: boolean;
}
```

- `runtime` lives only on `ServerConfig` and is piped to `createRestApp` as a parameter. It is not duplicated onto `RestConfig`.
- `services` is required. An empty array throws at initialization.
- `diagnostics` defaults to `false`. When enabled, internal modules emit diagnostic output through `createDiagnosticsLog`.
- `logServices` defaults to `true`. Prints a `console.table` of registered services (Service, Description, Actions count). Not gated by `diagnostics`. Set `logServices: false` to suppress.
- When REST is configured, endpoint URLs are always printed via `console.log` using `rest.host` (default `"localhost"`) and `rest.port` (default `8000`).
- `forceNewInstance` defaults to `false`. When `false`, a second `createNileServer` call returns the existing server instance with a warning logged. Set to `true` to explicitly create a new instance (useful in tests).

## 4. `NileContext`

**Path:** `nile/nile.ts`
**Factory:** `createNileContext(params?)`

The context is a singleton per server. It carries interface-specific data, hook execution state, session storage, and a general-purpose key-value store. It supports an optional `TDB` generic to provide type safety for the database resource.

### 4.1 Key-Value Store

```typescript
context.set("tenant", { id: "abc" });
const tenant = context.get<{ id: string }>("tenant");
```

`_store` is a `Map<string, unknown>` exposed as readonly. Use `get`/`set` methods for access.

### 4.2 Sessions

Each `NileContext` owns its own session store. Multiple server instances do not share session state.

```typescript
context.setSession("rest", { userId: "123", token: "abc" });
const session = context.getSession("rest");
// { userId: "123", token: "abc" }
```

Session keys are `"rest" | "ws" | "rpc"`, matching the interface types.

### 4.3 Hook Context

`hookContext` tracks the lifecycle of a single action execution. It is reset at the start of each `executeAction` call via `resetHookContext(actionName, input)`.

```typescript
context.hookContext.actionName;  // current action
context.hookContext.state;       // mutable key-value shared between hooks
context.hookContext.log;         // { before: HookLogEntry[], after: HookLogEntry[] }
```

Mutation methods: `updateHookState`, `addHookLog`, `setHookError`, `setHookOutput`.

### 4.4 Request-Scoped Contexts (AsyncLocalStorage)

Interface-specific data (`rest`, `ws`, `rpc`, `sessions`) is isolated per-request via `AsyncLocalStorage`. Concurrent requests never see each other's state.

```typescript
// Inside an action handler or middleware during a REST request:
const rest = context.get<HonoContext>("rest");   // current request's Hono context
const session = context.getSession("rest");       // current request's session data

// Outside a request scope (e.g., during boot):
context.get("rest"); // undefined
```

The REST layer wraps each incoming request in `runInRequestScope()`, which creates an isolated `RequestStore` for that request's lifetime. All async continuations within the request see the same store.

```typescript
// How the REST layer scopes each request (internal):
runInRequestScope({ rest: honoContext, sessions: {} }, async () => {
  // Everything here (auth, hooks, handlers) reads from this request's store
  await engine.executeAction(service, action, payload, nileContext);
});
```

**Key exports:**
- `RequestStore`: interface for per-request state (`rest`, `ws`, `rpc`, `sessions`)
- `runInRequestScope(store, fn)`: runs a callback within an isolated request scope
- `getRequestStore()`: retrieves the current request's store (undefined outside a request)

### 4.5 Resources

```typescript
context.resources?.logger;
context.resources?.database; // typed as TDB
context.resources?.cache;
```

Extensible via index signature. Passed through from `ServerConfig.resources`. The `database` field is typed as `TDB` (defaulting to `unknown`).

## 5. Key Types

### 5.1 `BeforeActionHandler`

Global hook that runs before every action. Returns a `Result`. `Err` halts the pipeline.

```typescript
type BeforeActionHandler<T, E> = (params: {
  nileContext: NileContext<unknown>;
  action: Action;
  payload: unknown;
}) => Result<T, E>;
```

### 5.2 `AfterActionHandler`

Global hook that runs after every action. Receives the action result and can transform it.

```typescript
type AfterActionHandler<T, E> = (params: {
  nileContext: NileContext<unknown>;
  action: Action;
  payload: unknown;
  result: Result<T, E>;
}) => Result<T, E>;
```

### 5.3 `Sessions`

```typescript
type Sessions = {
  rest?: Record<string, unknown>;
  ws?: Record<string, unknown>;
  rpc?: Record<string, unknown>;
};
```

### 5.4 `Resources`

```typescript
interface NileLogger {
  info: (input: { atFunction: string; message: string; data?: unknown }) => string;
  warn: (input: { atFunction: string; message: string; data?: unknown }) => string;
  error: (input: { atFunction: string; message: string; data?: unknown }) => string;
}

type Resources<TDB = unknown> = {
  logger?: NileLogger;
  database?: TDB;
  cache?: unknown;
  [key: string]: unknown;
};
```

The `logger` field accepts a `NileLogger`. The return type of `createLogger` from the logging module enables `handleError` and `createDiagnosticsLog` to log through the same logger instance.

## 6. Constraints

- **One context per server**: `createNileContext` is called once in `createNileServer`. All interfaces share this instance.
- **Generic Database Support**: To avoid generic leakage into the core engine, the database type `TDB` is only present in `NileContext` and `Resources`. High-level components (Engine, REST) use `unknown`.
- **`createNileServer` is async**: The function returns a `Promise<NileServer>`. Use `await` or `.then()`. Requires ES modules (top-level await) or wrapping in an async function.
- **`onBoot` crashes on failure**: The `onBoot` callback is awaited inside a `Promise.race` with a configurable timeout (`maxWaitTime`, default 10s). If it fails or times out, `process.exit(1)` is called. The server never returns in a degraded state.
- **Singleton by default**: A second `createNileServer` call returns the existing instance unless `forceNewInstance: true` is passed. A warning is logged when the cached instance is returned.
- **Runtime default**: If `config.runtime` is omitted, it defaults to `"bun"`. This affects static file serving and runtime-specific behavior.
- **No dynamic service injection**: Services are fixed at boot time. Adding services after initialization is not supported.

## 7. Failure Modes

- **Empty services**: `createNileServer` throws immediately with a descriptive error
- **`onBoot` crash or timeout**: Logged via diagnostics logger, then `process.exit(1)`. The server does not start in a degraded state. If `maxWaitTime` is exceeded, the error message includes the configured timeout value.
- **Missing resources**: `resources` is optional. Diagnostics fall back to `console.log` when `resources.logger` is absent (handled by `createDiagnosticsLog`)
- **Double initialization**: Returns cached instance with a warning unless `forceNewInstance: true`

## 8. `getContext`

**Path:** `nile/server.ts`

Exported function that retrieves the runtime `NileContext` from anywhere within a request scope. It accepts an optional `TDB` generic for type-safe database access. The context is stored in a module-level variable set during `createNileServer` initialization.

```typescript
import { getContext } from "@nilejs/nile";

// Type-safe access to your database
const ctx = getContext<MyDatabaseType>();

// Access resources, sessions, etc.
const db = ctx.resources?.database; // typed as MyDatabaseType
ctx.resources?.logger;
ctx.getSession("rest");
ctx.set("user", { id: "123" });
```

### 8.1 Usage Pattern

`getContext` is designed to be called from action handlers or utility functions that need access to the context but don't receive it as a parameter:

```typescript
// In an action handler
const handler = async (data, ctx) => {
  // Both ctx and getContext() work
  const userId = ctx.get("userId") ?? getContext().get("userId");
  return Ok({ userId });
};
```

### 8.2 Constraints

- **Must be called after server initialization**: `getContext` throws if called before `createNileServer` has run
- **Must be called within a request scope**: The context singleton is set at server boot. Per-request data (interface contexts, sessions) is isolated via AsyncLocalStorage. Use `context.get("rest")` or `context.getSession("rest")` within request handlers

### 8.3 Failure Modes

- **Called before server boot**: Throws `"getContext: Server not initialized. Call createNileServer first."`
