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

const server = createNileServer({
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

1. **Validate** — Throws immediately if `config.services` is empty
2. **Create `NileContext`** — Single instance with `config.resources` attached
3. **Create Engine** — Passes `services`, `diagnostics`, and global hook handlers
4. **Log services table** — When `config.logServices` is `true`, prints a `console.table` of registered services (name, description, actions). Always prints — not gated by `diagnostics`
5. **Create REST app** — Only if `config.rest` is provided. Passes engine, context, `serverName`, and `runtime` (defaults to `"bun"`)
6. **Print REST endpoint URLs** — When REST is configured, prints `POST http://host:port/baseUrl/services` and optionally `GET http://host:port/status` via `console.log`. Uses `rest.host` (default `"localhost"`) and `rest.port` (default `8000`)
7. **Run `onBoot`** — Fire-and-forget async IIFE. Failures are logged via `console.error` but do not crash the server

### 2.2 Return Value (`NileServer`)

```typescript
{
  config: ServerConfig;
  engine: Engine;
  context: NileContext;
  rest?: { app: Hono; config: RestConfig };
}
```

- `rest` is only present when `config.rest` was provided
- `engine` provides direct access to `getServices`, `getServiceActions`, `getAction`, `executeAction`
- `context` is the shared `NileContext` passed to all layers

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
    fn: (context: NileContext) => Promise<void> | void;
  };
}
```

- `runtime` lives only on `ServerConfig` and is piped to `createRestApp` as a parameter. It is not duplicated onto `RestConfig`.
- `services` is required. An empty array throws at initialization.
- `diagnostics` defaults to `false`. When enabled, internal modules emit diagnostic output through `createDiagnosticsLog`.
- `logServices` defaults to `true`. Prints a `console.table` of registered services (Service, Description, Actions count). Not gated by `diagnostics` — set `logServices: false` to suppress.
- When REST is configured, endpoint URLs are always printed via `console.log` using `rest.host` (default `"localhost"`) and `rest.port` (default `8000`).

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

### 4.4 Interface Contexts

```typescript
context.rest  // HonoContext (readonly, set at creation)
context.ws    // WebSocketContext (readonly)
context.rpc   // RPCContext (readonly)
```

These are set once during `createNileContext` via the `interfaceContext` parameter. The REST layer creates a fresh context per request with the Hono context attached.

### 4.5 Resources

```typescript
context.resources?.logger;
context.resources?.database; // typed as TDB
context.resources?.cache;
```

Extensible via index signature. Passed through from `ServerConfig.resources`. The `database` field is typed as `TDB` (defaulting to `unknown`).

## 5. Key Types

### 5.1 `BeforeActionHandler`

Global hook that runs before every action. Returns a `Result` — `Err` halts the pipeline.

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

The `logger` field accepts a `NileLogger` — the return type of `createLogger` from the logging module. This enables `handleError` and `createDiagnosticsLog` to log through the same logger instance.

## 6. Constraints

- **One context per server** — `createNileContext` is called once in `createNileServer`. All interfaces share this instance.
- **Generic Database Support** — To avoid generic leakage into the core engine, the database type `TDB` is only present in `NileContext` and `Resources`. High-level components (Engine, REST) use `unknown`.
- **`onBoot` is fire-and-forget** — It runs in an async IIFE and is not awaited. Errors are caught by `safeTry` and logged to `console.error`.
- **Runtime default** — If `config.runtime` is omitted, it defaults to `"bun"`. This affects static file serving and runtime-specific behavior.
- **No dynamic service injection** — Services are fixed at boot time. Adding services after initialization is not supported.

## 7. Failure Modes

- **Empty services** — `createNileServer` throws immediately with a descriptive error
- **`onBoot` crash** — Caught by `safeTry`, logged to `console.error`, does not prevent server from starting
- **Missing resources** — `resources` is optional. Diagnostics fall back to `console.log` when `resources.logger` is absent (handled by `createDiagnosticsLog`)

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

- **Must be called after server initialization** — `getContext` throws if called before `createNileServer` has run
- **Must be called within a request scope** — The context is set once at server boot, not per-request. For per-request isolation, use the context passed to action handlers

### 8.3 Failure Modes

- **Called before server boot** — Throws `"getContext: Server not initialized. Call createNileServer first."`
