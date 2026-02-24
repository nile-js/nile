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