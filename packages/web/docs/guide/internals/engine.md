# Service Action Engine

**Type:** Reference / Specification  
**Path:** `src/engine/`

## 1. Purpose

The Service Action Engine provides a high-performance, $O(1)$ routing and introspection layer for business operations, and a unified execution pipeline. It maps a flat array of domain-specific `Services` (and their nested `Actions`) into pre-computed memory structures upon initialization. 

This engine is designed to sit below the HTTP/RPC transport layer (e.g., Hono), decoupling the knowledge of available actions from the transport mechanism used to invoke them.

### 1.1 Responsibilities

*   **Initialization:** Parse the `services` array exactly once on boot.
*   **Introspection:** Provide lightweight, zero-latency metadata for available services and actions to enable dynamic discovery.
*   **Routing:** Provide strict $O(1)$ memory pointer lookups for specific actions based on `serviceName` and `actionName`.
*   **Execution Pipeline:** Process the full action lifecycle safely, including Global/Action-level Hooks, Payload Validation (Zod), and safe Handler execution.
*   **Diagnostics:** Emit timing and status information via `createDiagnosticsLog` from `src/utils.ts` when `diagnostics` is enabled. See `docs/internals/logging.md` section 7.
*   **Result Pattern Enforcement:** Ensure all internal engine methods return a `Result<T, E>` from the `slang-ts` library to eliminate `try/catch` requirements in the transport layer.

### 1.2 Non-Goals

*   **HTTP Routing:** The engine has no concept of HTTP methods, headers, or paths.

## 2. Architecture and Data Structures

To achieve guaranteed $O(1)$ lookups and prevent latency spikes, the engine pre-computes three internal data structures during `createEngine`:

1.  `serviceSummaries`: An array of `ServiceSummary` objects used for fast enumeration of all available services.
2.  `serviceActionsStore`: A dictionary mapping a `serviceName` to an array of lightweight `ActionSummary` objects. This avoids sending bulky schema/handler definitions during introspection.
3.  `actionStore`: A nested dictionary (`Record<serviceName, Record<actionName, Action>>`) that holds the exact memory pointers to the full `Action` objects for execution routing.

The engine execution pipeline helpers are extracted into `pipeline.ts` to keep the code modular and under the 400 LOC limit.

## 3. Public API

The engine exposes four strictly-typed methods. All methods return a `slang-ts` `Result`.

### 3.1 `getServices()`

Returns an array of all registered services.

**Returns:** `Result<ServiceSummary[], string>`

```typescript
const result = engine.getServices();
if (result.isOk) {
  const services = result.value; 
  // [ { name: 'auth', description: '...', actions: ['login', 'logout'] } ]
}
```

### 3.2 `getServiceActions(serviceName: string)`

Returns lightweight metadata for all actions within a specific service.

**Returns:** `Result<ActionSummary[], string>`

```typescript
const result = engine.getServiceActions('auth');
if (result.isOk) {
  const actions = result.value;
  // [ { name: 'login', isProtected: false, validation: true, accessControl: ['public'] } ]
}
```

*Note:* The `validation` property is a boolean indicating whether the action has a defined Zod schema (`!!action.validation`).

### 3.3 `getAction(serviceName: string, actionName: string)`

Returns the full, executable `Action` object. Typically used internally by the execution pipeline.

**Returns:** `Result<Action, string>`

```typescript
const result = engine.getAction('auth', 'login');
if (result.isOk) {
  const action = result.value;
  // { name: 'login', handler: [Function], validation: ZodObject, hooks: {...} }
}
```

### 3.4 `executeAction(serviceName: string, actionName: string, payload: unknown, nileContext: NileContext)`

Executes an action through the full pipeline (Global Before Hook -> Action Before Hooks -> Validation -> Handler -> Action After Hooks -> Global After Hook). The caller must provide a `NileContext` instance — the engine never creates one internally.

**Returns:** `Promise<Result<unknown, string>>`

```typescript
const nileContext = createNileContext();
const result = await engine.executeAction('auth', 'login', { username: 'test', password: '123' }, nileContext);
if (result.isOk) {
  const data = result.value;
} else {
  console.error("Action failed:", result.error);
}
```

## 4. Execution Pipeline

When `executeAction` is called, the following steps run in sequence:

1. **Global Before Hook** (`onBeforeActionHandler`) — Pass/fail guard only, does not mutate payload
2. **Action-Level Before Hooks** (`action.hooks.before`) — Sequential, output becomes next input (mutates payload)
3. **Zod Validation** — Uses `action.validation.safeParse()` with `prettifyError` for formatting
4. **Main Handler** — Core business logic
5. **Action-Level After Hooks** (`action.hooks.after`) — Sequential, mutates result
6. **Global After Hook** (`onAfterActionHandler`) — Final cleanup/logging

### 4.1 Hook Failure Behavior

- Each `HookDefinition` has an `isCritical: boolean` flag
- `isCritical: true` — if the hook returns `Err` or throws, the pipeline halts immediately
- `isCritical: false` — failure is logged but execution continues with the previous value

### 4.2 Pipeline Response Mode

If an action sets `result: { pipeline: true }`, the return includes the full hook execution log:

```typescript
// Standard return
Ok(data)

// Pipeline mode return
Ok({
  data: data,
  pipeline: {
    before: [ { name: "service.hook", passed: true, input: ..., output: ... } ],
    after: []
  }
})
```

## 5. Crash Safety (`safeTry`)

All handler and hook invocations in `pipeline.ts` are wrapped in `safeTry` from `slang-ts`. This prevents uncaught exceptions from crashing the process.

Protected call sites:
- `runHook` — action-level before/after hook handlers
- `runHandler` — main action handler
- `runGlobalBeforeHook` — global before hook
- `runGlobalAfterHook` — global after hook

If a handler throws instead of returning a `Result`, `safeTry` catches the exception and returns `Err(error.message)`. The pipeline then handles it identically to a handler-returned `Err`.

## 6. Constraints and Failure Modes

### 6.1 Constraints

*   **Memory Bound:** Because the engine loads all `services` and their dependencies (Zod schemas, DB models via imports) into memory upfront, it is designed for persistent, long-running server environments (e.g., standard Node.js/Bun containers), not aggressive cold-start environments.
*   **Immutability:** The initialized stores (`actionStore`, etc.) are closed over in the factory function and cannot be modified at runtime. Dynamic injection of actions post-boot is not supported.
*   **File Size:** The core `engine.ts` must remain under 400 LOC, relying on `pipeline.ts` for pipeline steps.

### 6.2 Failure Modes

*   **Missing Service/Action:** Calling `getServiceActions`, `getAction`, or `executeAction` with an unregistered name will immediately return an `Err(string)` result. The transport layer must handle this by returning a `404 Not Found` or equivalent error to the client.
*   **Duplicate Actions:** If the `services` array contains duplicate action names within the same service, the last one in the array will silently overwrite the previous one during map construction.

## 7. Key Types

All types below are exported from `src/index.ts` and defined in `src/engine/types.ts`.

### 7.1 `EngineOptions`

Configuration passed to `createEngine`:

```typescript
{
  diagnostics?: boolean;
  services: Services;
  onBeforeActionHandler?: BeforeActionHandler<unknown, unknown>;
  onAfterActionHandler?: AfterActionHandler<unknown, unknown>;
}
```

`createEngine` is consumed internally by `createNileServer` — developers configure these values via `ServerConfig`.

### 7.2 `HookContext`

Tracks the full lifecycle state of a single action execution. Attached to `NileContext.hookContext` and reset at the start of each `executeAction` call.

```typescript
{
  actionName: string;
  input: unknown;
  output?: unknown;
  error?: string;
  state: Record<string, unknown>;
  log: {
    before: HookLogEntry[];
    after: HookLogEntry[];
  };
}
```

- `state` — mutable key-value store for hooks to share data within a single execution
- `log` — accumulated `HookLogEntry` records from before/after hook phases

### 7.3 `HookLogEntry`

A single hook execution record:

```typescript
{
  name: string;    // "serviceName.actionName"
  input: unknown;
  output: unknown;
  passed: boolean;
}
```

### 7.4 `HookDefinition`

Declares a hook as a reference to another action in the system:

```typescript
{
  service: string;
  action: string;
  isCritical: boolean;
}
```

See section 4.1 for `isCritical` behavior.

### 7.5 `ActionResultConfig`

Controls the shape of `executeAction` return values:

```typescript
{
  pipeline: boolean;
}
```

When `pipeline: true`, the result includes the full hook execution log alongside the data. See section 4.2.

## 8. Factory Functions

The `@nilejs/nile` package exports typed identity functions for defining services and actions with full type inference.

### 8.1 `createAction`

Creates a single action with full type inference. No runtime overhead — returns the config as-is.

```typescript
import { createAction } from '@nilejs/nile';

export const loginAction = createAction({
  name: 'login',
  description: 'User login',
  handler: async (data, ctx) => { /* ... */ },
  validation: loginSchema,
  isProtected: false,
  accessControl: ['public'],
});
```

### 8.2 `createActions`

Creates multiple actions at once. This is optional — you can also pass action arrays directly.

```typescript
import { createActions } from '@nilejs/nile';

export const authActions = createActions([
  createAction({ name: 'login', description: '...', handler: loginHandler, validation: loginSchema }),
  createAction({ name: 'logout', description: '...', handler: logoutHandler }),
]);
```

### 8.3 `createService`

Creates a service with full type inference.

```typescript
import { createService } from '@nilejs/nile';

export const authService = createService({
  name: 'auth',
  description: 'Authentication service',
  actions: authActions,
});
```

### 8.4 `createServices`

Creates multiple services at once.

```typescript
import { createServices } from '@nilejs/nile';

export const allServices = createServices([
  authService,
  userService,
  taskService,
]);
```

### 8.5 Recommended Project Structure

For larger applications, organize actions one-per-file in domain folders. Define all services in a single `services.config.ts` file that imports the actions and exports the services array. No barrel (`index.ts`) file per service folder is needed.

Keep database code in a separate `db/` directory — schema definitions, client setup, and model files that encapsulate all data access logic. See [Database Utilities](/guide/internals/db) for the full model file pattern.

```
src/
├── db/
│   ├── client.ts              # database client setup (e.g. PGlite + Drizzle)
│   ├── schema.ts              # Drizzle table definitions
│   ├── types.ts               # inferred types from schema
│   ├── index.ts               # barrel exports
│   └── models/
│       ├── tasks.ts           # CRUD model functions for tasks table
│       ├── users.ts           # CRUD model functions for users table
│       └── index.ts           # barrel exports
├── services/
│   ├── auth/
│   │   ├── login.ts           # exports loginAction
│   │   ├── logout.ts          # exports logoutAction
│   │   └── profile.ts         # exports profileAction
│   ├── tasks/
│   │   ├── create.ts          # exports createTaskAction
│   │   ├── list.ts            # exports listTaskAction
│   │   ├── get.ts             # exports getTaskAction
│   │   ├── update.ts          # exports updateTaskAction
│   │   └── delete.ts          # exports deleteTaskAction
│   └── services.config.ts     # imports all actions, defines all services, exports Services array
├── server.config.ts           # imports services, exports ServerConfig (optional, can be inline in index.ts)
└── index.ts                   # imports server config/services, creates server
```

Action handlers call model functions for data access — they should not contain raw database queries. Models handle validation, error logging, and return `Result` types that handlers forward to the client.

Each action file defines the handler inline (not exported) and only exports the action:

```typescript
// services/auth/login.ts
import { Ok } from 'slang-ts';
import z from 'zod';
import { createAction } from '@nilejs/nile';

const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
});

const loginHandler = (data) => {
  // ... validation and logic
  return Ok({ userId: '123' });
};

export const loginAction = createAction({
  name: 'login',
  description: 'User login',
  handler: loginHandler,
  validation: loginSchema,
});
```

The `services.config.ts` file imports all actions and defines services using `createServices`:

```typescript
// services/services.config.ts
import { createServices, type Services } from '@nilejs/nile';
import { loginAction } from './auth/login';
import { logoutAction } from './auth/logout';
import { profileAction } from './auth/profile';
import { createTaskAction } from './tasks/create';
import { listTaskAction } from './tasks/list';

export const services: Services = createServices([
  {
    name: 'auth',
    description: 'Authentication service',
    actions: [
      loginAction,
      logoutAction,
      profileAction,
    ],
  },
  {
    name: 'tasks',
    description: 'Task management service',
    actions: [
      createTaskAction,
      listTaskAction,
    ],
  },
]);
```

For larger applications, you may extract the server configuration into a separate `server.config.ts` that imports the services array. For smaller projects, defining the config directly in `index.ts` is equally valid.

### 8.6 Alternative — Barrel File Pattern

An alternative (not recommended for most projects) is to create a barrel file per service folder using `createService`. This adds a file per domain but can be useful for very large codebases where you want explicit service boundaries:

```
services/
├── auth/
│   ├── login.ts           # exports loginAction
│   ├── logout.ts          # exports logoutAction
│   └── index.ts           # imports actions, exports authService via createService
├── tasks/
│   ├── create.ts
│   ├── list.ts
│   └── index.ts           # exports taskService via createService
└── index.ts               # imports all services, exports via createServices
```

```typescript
// services/auth/index.ts
import { createAction, createService } from '@nilejs/nile';
import { loginAction } from './login';
import { logoutAction } from './logout';

export const authService = createService({
  name: 'auth',
  description: 'Authentication service',
  actions: [loginAction, logoutAction],
});
```