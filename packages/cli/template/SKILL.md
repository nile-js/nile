---
name: nile
description: Work in a Nile Js backend (@nilejs/nile 1.x). Organize business operations as services and actions with Zod validation, Result returns, hooks, JWT protection and typed clients. Use when adding or changing actions, services, hooks, uploads, topics, schedules or the @nilejs/client calls in a Nile Js project.
license: MIT
---

# Working in a Nile Js application

Nile Js organizes a backend into **services** (business areas) and **actions** (one operation each). Read the project's `src/services/services.config.ts` first: it is the registry of every action the server exposes. Then read the domain’s `index.ts`, a neighboring action, its model and any global policy hooks. Follow one operation from registration to persistence before changing it.

Use Nile’s conventions to make business operations easy to find. Prefer named functions, explicit inputs and early Result branches. Choose FP helpers when they make absence, failure, transformation or async control clearer; ordinary functions and straightforward `if` statements remain useful.

Documentation: https://nile-js.github.io/nile/guide/
Feature pages: https://nile-js.github.io/nile/guide/features/
Examples: https://nile-js.github.io/nile/guide/examples/
Every guide page is also listed in https://nile-js.github.io/nile/llms.txt

## Project structure

Service and action entry points are the enforced core. The rest of this tree shows where supporting code goes when needed. Add optional layers when a real feature needs them; do not generate empty layers up front.

```text
src/
  index.ts                         listener and process lifecycle
  server.ts                        optional server composition
  config.ts                        optional environment parsing in one place
  services/
    services.config.ts             explicit service registry
    projects/
      index.ts                     createService and public actions
      actions/
        create.ts                  a small action
        archive/
          archive.ts               a larger action's entry point
          index.ts                 exports archiveAction
          modules/                 archive's private helpers
      modules/                     helpers shared within this domain
  db/
    client.ts                      connection and driver
    models/                        persistence operations
  hooks/                           shared action policies
  business/                        optional reusable domain functions
  generated/                       client payload/schema contracts
```

Create a project with `bunx @nilejs/cli new my-app`. Start it with `bun run dev`. Generate code with `bun run gen service <name>` and `bun run gen action <service> <action>`. Generate Zod schemas and accepted payload types from validations with `bun run gen schema`. Handler types describe parsed output (`z.infer`); client payload types describe input (`z.input`), so fields with defaults can be omitted by callers.

Structure violations fail startup by default. An application needs `src/index.ts` or `src/server.ts`, `src/services/services.config.ts`, and each service’s `index.ts` and `actions/`. For a growing action, use `actions/archive/archive.ts`, an `index.ts` export and private helpers in `actions/archive/modules/`. Action entry points above 400 lines are reported for refactoring. `project: { root: ".", structure: "warn" }` reports violations without stopping; `false` disables inspection. Source-less bundles skip inspection unless a root is explicit.

## The action pattern

Define a named schema, derive the handler’s data type and pass the named handler to `createAction`. The action type and handler return type are inferred. Use `data` and `context` for the parameters you need; omit unused parameters:

```ts
import { createAction } from "@nilejs/nile";
import { Err, Ok } from "@nilejs/nile/fp";
import { z } from "zod";

const createProjectSchema = z.object({
  name: z.string().trim().min(3, "Name must have at least 3 characters"),
});

type CreateProjectInput = z.infer<typeof createProjectSchema>;

const createProjectHandler = (data: CreateProjectInput) => {
  if (data.name === "system") {
    return Err("Choose a different project name");
  }

  return Ok({ project: { name: data.name } });
};

export const createProjectAction = createAction({
  name: "create",
  description: "Create a project",
  validation: createProjectSchema,
  handler: createProjectHandler,
});
```

Register the action in its service entry point, then register the service:

```ts
// src/services/projects/index.ts
import { createService } from "@nilejs/nile";
import { createProjectAction } from "./actions/create";

export const projectsService = createService({
  name: "projects",
  description: "Project operations",
  actions: [createProjectAction],
});
```

```ts
// src/services/services.config.ts
import { createServices } from "@nilejs/nile";
import { projectsService } from "./projects";

export const services = createServices([projectsService]);
```

Action names are unique within a service. Folder names do not create routes; only the registry does.

## Handlers take (data, context)

Nile Js calls every handler with two arguments: the validated input and the execution's `NileContext`. For a named handler, annotate `data` with the schema’s parsed output type and use `context` for its second parameter. Import `NileContext` when you need to annotate it. `createAction` infers its type from the handler; leave off the repeated generic argument and inferred return annotation. Read an optional context with `?.` or explicitly reject its absence before using it.

- `context.getSession("rest")` returns the verified JWT identity (`userId`, `organizationId` and other claims) for a protected action.
- `context.resources` holds what `createNileServer` received (`logger`, `database`).
- `context.execution` holds `requestId`, `transport`, `signal` and `clientKey`.
- `context.updateHookState` and `context.hookContext.state` are per execution. `context.set` and `context.get` are shared by every request in the process.
- `getContext<T>()` returns the context outside a handler. It throws before `createNileServer` runs.

## Results

Handlers return `Ok(value)` or `Err(message)` from `@nilejs/nile/fp`, which re-exports `slang-ts`. Check `isErr` before reading `value`. Use `safeTry` around a call that can throw or reject. Use `utils.handleError({ message, data })` with `import { utils } from "@nilejs/nile"` to log an error and return it as an `Err` in one step.

The default success message is `Action completed.` Set `successMessage` on the action, or return `Ok(value, message)` to choose one per call; the handler's message wins.

HTTP envelope: success is `{ status: true, message, data }`. Failure is `{ status: false, message, data }`; inspect the envelope rather than assuming every failure has the same HTTP status. Validation failures use Zod’s prettified message (or an explicit validation message) and put a generated unique reference in `data.errorCode` alongside field paths in `data.issues`.

Slang 0.2.2 preserves caught causes on `result.raw`. `safeTry` returns a Result directly, including when the callback returns a Result; never expect a Result inside `result.value`. Nested `Ok(Ok(...))` and `Ok(Err(...))` are rejected. Return an existing Result directly.

`dbTry` is removed. For a database promise, use `safeTry`, inspect `result.raw` internally and pass `utils.describeError(result.raw)` to `utils.handleError` with a deliberate caller-safe message. `result.error` may contain driver text and must not be forwarded blindly. Unexpected throws inside Nile-managed work are logged and become `Error Code: <unique-code> - could not complete the action`. The generated reference matches the log’s `log_id`. Never use it as a stable error category. Custom success and intentional `Err` messages retain their wording.

`raw` is reserved for internal diagnostics and removed recursively from outgoing JSON and Socket.IO messages. Choose another name for public domain fields. Do not rely on that filter to sanitize secrets stored under other names.

## Choose FP helpers for the job

Import from `@nilejs/nile/fp`, so application code and Nile share the same Slang types. Import Nile-specific helpers through `utils` from `@nilejs/nile`. Check the installed declarations before using an unfamiliar helper; do not copy APIs from a different FP library.

| Need | Use | Important boundary |
|---|---|---|
| An operation can succeed or fail | `Ok`, `Err`, `Result` | Check `isErr` before reading `value`; propagate a narrowed failure directly. |
| A dependency can throw or reject | `safeTry` | Await it. A caught failure still needs a safe caller message. |
| A value may legitimately be absent | `option`, `Option` | Absence is different from a failed lookup. |
| Both Result or Option branches produce a value | `match` | Supply both branches; callbacks receive the variant, not its unwrapped payload. |
| Several domain cases choose behavior | `matchAll` | Include the `_` fallback; keep business cases explicit. |
| A successful value needs a transformation | `andThen` | It propagates failure; await async transformations. Do not return `undefined` to mean removal. |
| Several Result-producing steps form a pipeline | `pipe` | Use the installed `.run()` API. A plain sequence of early returns is often easier to read. |
| Indexed slicing, shaping or set operations need explicit failure handling | `list`, `struct`, `sets`, `Ok.iterate` | Collection chains can return `Fallible`; finish with a deliberate fallback or handle the failure. |
| One async operation needs cancellation/deadline control | `superPromise` | It settles to a Result. Pass its signal to the dependency. |
| Several controlled tasks share a concurrency budget | `taskGroup`, `superRunner` | Share the group across calls; creating one per action execution does not bound total concurrency. |
| A pure calculation is reused with the same arguments | `memoized` | It caches by argument identity; do not cache sessions, permissions or mutable database reads this way. |
| An in-process notification coordinates local functions | `createChannel`, `createSignal` | These are local primitives, not Nile’s schema-validated Socket.IO topics or a cross-process event bus. |

### Propagate Results instead of nesting them

Use an early failure branch when it makes the operation easier to follow. Once a Result is narrowed to `Err`, return it directly. A handler returning a Result does not need another `Ok` around that Result.

```ts
import { Err, Ok, type Result } from "@nilejs/nile/fp";

const calculateTotal = (quantity: number): Result<number, string> => {
  if (quantity < 1) {
    return Err("Choose at least one item");
  }
  return Ok(quantity * 100);
};

export const prepareQuote = (quantity: number) => {
  const total = calculateTotal(quantity);
  if (total.isErr) {
    return total;
  }
  return Ok({ total: total.value });
};
```

`andThen` is useful for a short transformation of a successful value. In this Slang version, callbacks may return a plain value or a Result; the returned Result is not nested. A callback returning `undefined` preserves the original value, so do not use that to remove data. Callback exceptions become failures; keep them free of secret-bearing exception messages if the Result will reach a caller.

### Model expected absence explicitly

Use an Option when “not configured yet” is a valid answer. Use an Err when the operation cannot proceed without the value. Do not silently turn a failed database call into an empty collection or a missing setting.

```ts
import { match, option } from "@nilejs/nile/fp";

export const getDisplayName = (name: string | null) => {
  return match(option(name), {
    Some: (present) => {
      return present.value;
    },
    None: () => {
      return "Unnamed project";
    },
  });
};
```

Slang’s absence rules matter: `0` and `false` are present; `null`, `undefined`, empty strings and non-finite numbers are absent. Use an explicit check or a schema instead when an empty string is meaningful domain data. `.unwrap().else(fallback)` is for a deliberate fallback; `.expect()` and `.panic()` throw and should not replace normal input validation or business refusals.

### Translate dependency failures at their boundary

Use `safeTry` for a promise that can throw. Keep the original cause for bounded internal diagnostics and return an intentional message. A returned `Err` from your own code may already be safe and logged; propagate it instead of logging it repeatedly.

```ts
import { utils, type NileLogger } from "@nilejs/nile";
import { Ok, safeTry } from "@nilejs/nile/fp";

export const readProviderStatus = async (
  url: string,
  signal: AbortSignal,
  logger: NileLogger
) => {
  const response = await safeTry(() => fetch(url, { signal: signal }));
  if (response.isErr) {
    return utils.handleError({
      message: "Could not check the provider status",
      atFunction: "readProviderStatus",
      data: utils.describeError(response.raw),
      logger: logger,
    });
  }
  return Ok({ available: response.value.ok });
};
```

The same pattern applies to raw database promises. Nile’s model helpers already return Results; inspect those directly. `safeTry` can flatten a Result-returning callback, but a second wrapper is unnecessary when the operation already has the intended failure contract. Never look for another `isErr` inside `result.value`.

### Choose one owner for async policy

Use `superPromise` for a dependency operation that needs Slang’s timeout, cancellation or task-group controls. Use Nile’s execution settings and `utils.createQueue`, `utils.createRateLimiter` or `utils.retryFnWithJitter` when the policy belongs to an action or shared application resource. Avoid independently stacked retries and deadlines: they multiply attempts and obscure which operation failed.

```ts
import { superPromise, taskGroup } from "@nilejs/nile/fp";

const providerCalls = taskGroup("provider-status", { concurrency: 4 });

export const checkProvider = async (url: string, signal: AbortSignal) => {
  const task = superPromise(
    async (attemptSignal) => {
      const response = await fetch(url, { signal: attemptSignal });
      return { available: response.ok };
    },
    { group: providerCalls, timeout: 3000 }
  );
  const cancel = () => {
    task.abort();
  };
  if (signal.aborted) {
    cancel();
  } else {
    signal.addEventListener("abort", cancel, { once: true });
  }
  try {
    return await task;
  } finally {
    signal.removeEventListener("abort", cancel);
  }
};
```

This helper is internal: its failure still needs translation before being returned publicly. A timeout or aborted Result does not roll back completed effects. Retry only operations safe to repeat, use idempotency for writes, and keep retry count, pending work and concurrency bounded. A task group limits running attempts; it does not cap all pending work or persist jobs. Use a Nile queue with explicit capacity when you also need admission control. Long-lived resources belong in the application lifecycle so shutdown can drain or close them.

## Calling actions

- HTTP: `POST /api/services` with `{ "intent": "execute", "service": "projects", "action": "create", "payload": { ... } }`.
- Client (`@nilejs/client`): `createNileClient<Payloads>({ baseUrl })`, then `await nile.invoke({ service, action, payload })`. Every method returns a Result: `if (result.isErr) { ... return; }`, then read `result.value`. On failure `result.error` is the message and `result.details` holds the server's `data`. `data` is a deprecated alias; do not use it.
- Sockets: `createNileSocketClient<Actions, Topics>` owns its connection. Use `socket.invoke`, `socket.send` and `socket.receive`; check each Result and unsubscribe/close when finished. Declare backend topics and validate their data and scope; frontend types come from shared or generated definitions. Authorization is still a backend policy.
- Server code: `await server.invoke({ service, action, payload, credentials? })`. Protected actions need `credentials` with headers.
- Uploads: `nile.upload({ service, action, files, fields })` for `isSpecial: { contentType: "multipart/form-data" }` actions. A JSON request to such an action returns HTTP 400.

## Organize a feature as it grows

1. Find the domain in `services.config.ts` and read its `index.ts`. Name the action for the business operation, then define its input schema and named handler.
2. Keep a short, single-use rule in that handler. Extract ordinary domain functions when a rule is reused, complicated enough to test independently, or coordinates a transaction. Do not create a repository, class or service layer solely because a folder exists.
3. Put data access in the project’s model convention. `utils.createModel` and `utils.getZodSchema` are optional Drizzle helpers; a handwritten model is also valid. Pass the database or transaction explicitly where transaction ownership matters.
4. For a growing action, move its private helpers under its action folder’s `modules/`. Put helpers shared by the domain in the service’s `modules/`. Cross-domain rules can use `business/` when useful. Do not expose a private helper as an action just to call it.
5. Register the action in the domain’s `actions` list. An export alone does not make it reachable. Register a new service in the root registry.
6. Carry validated input into business functions and trusted identity into policy checks. Keep request identity in scoped sessions and execution state, not process-wide context values.
7. Verify the registered operation through `server.invoke` or a transport when changing validation, permissions or registration. Test a transaction’s rollback and idempotency when those are part of the business guarantee.

A transaction belongs to the layer that knows which writes must be atomic. Calling several actions or adding an after hook does not make the work transactional. An after hook is not a `finally` block: cleanup belongs in `finally` or the lifecycle, since after hooks do not run after every failure.

## Anti-patterns to avoid

| Anti-pattern | Prefer |
|---|---|
| `Ok(existingResult)` or checking `result.value.isErr` | One Result boundary, then an early failure branch or a short transformation. |
| Returning a caught driver’s `result.error` directly | Log bounded diagnostics and choose a safe business-facing message. |
| `.expect()`, `.panic()` or a non-null assertion to bypass an ordinary refusal | An explicit Err, Option branch or validation schema. |
| `unwrap().else([])` on a failed write or required lookup | Preserve the failure; default only when absence is a valid answer. |
| Long chains with hidden writes and logging | Named functions and explicit Result checks around side effects. |
| Parsing or guessing business values in a before hook | Treat payloads as untrusted; rely on the action’s parsed input for business logic. |
| `context.set("user", identity)` | Scoped sessions or an application-owned request scope. |
| Creating a queue, rate limiter or task group inside every invocation | A shared resource with an explicit owner and shutdown policy. |
| Unbounded `Promise.all` over user-sized inputs | A concurrency limit and bounded pending work. |
| Memoizing authorization or mutable account state | Fresh checks or an explicit cache with appropriate invalidation. |
| Treating a generated diagnostic code as `NOT_FOUND` or another stable category | Keep domain decisions in explicit data/schema contracts; use the generated code only to find a log. |
| Assuming optional schemas, topics or hooks authorize an operation | Enforce authorization at the backend policy boundary. |

## Protection and policy

- JWT: set `auth: { secret, method: "header" }` on the server and `isProtected: true` on the action. Both are required.
- `accessControl` lists role labels. Nile Js stores them but does not enforce them. Enforce them in a global `onBeforeActionHandler` that checks `action.accessControl` against the session's `roles`.
- Hooks: `hooks.before` and `hooks.after` run another action's handler directly. They do not run that action's JWT check, validation or hooks.
- Discovery is off by default. When `rest.discovery.secret` is configured, `explore` and `schema` need the matching `payload.discoverySecret`. Enabling discovery without a secret exposes metadata to callers.

## Feature guides

Read the page for the feature you change before you write code:

- [Validation and errors](https://nile-js.github.io/nile/guide/features/validation-and-errors)
- [Authentication and hooks](https://nile-js.github.io/nile/guide/features/authentication-and-hooks)
- [Context and logging](https://nile-js.github.io/nile/guide/features/context-and-logging)
- [Queues, debounce and throttle](https://nile-js.github.io/nile/guide/features/queues-debounce-throttle)
- [Telemetry](https://nile-js.github.io/nile/guide/features/telemetry)
- [WebSockets](https://nile-js.github.io/nile/guide/features/websockets)
- [Cron jobs](https://nile-js.github.io/nile/guide/features/cron-jobs)
- [Database models](https://nile-js.github.io/nile/guide/features/database-models)
- [API discovery and schemas](https://nile-js.github.io/nile/guide/features/api-discovery)
- [HTTP, WebSocket and direct calls](https://nile-js.github.io/nile/guide/features/calling-actions)
- [Retries and utilities](https://nile-js.github.io/nile/guide/features/retries-and-utilities)
- [Rate limiting](https://nile-js.github.io/nile/guide/features/rate-limiting)
- [File uploads](https://nile-js.github.io/nile/guide/features/file-uploads)
- [Readiness and shutdown](https://nile-js.github.io/nile/guide/features/readiness-and-shutdown)

Advanced pages cover handler context, composed hooks, execution options and testing with `server.invoke`: https://nile-js.github.io/nile/guide/advanced/

## Rules for agents

1. Read `services.config.ts`, the target service’s `index.ts` and its actions before you change anything.
2. Follow the existing pattern in that service. Do not add a second architecture.
3. Never invent an API. Check the guide, the installed `@nilejs/nile` types in `node_modules`, or the existing code. If it is not there, say so.
4. Use named schemas and handlers. Name action parameters `data` and `context`, and hook parameters `hookContext`. Annotate a named handler’s data from the schema; let `createAction` and return types infer the rest. Use braces on every `if`.
5. Start with business rules in the action’s named handler. Move reusable rules or transaction coordination into ordinary domain functions when that makes them easier to share or test. Keep persistence in models or repositories; keep transaction boundaries explicit.
6. Typecheck and run the relevant tests after a coherent change. Exercise the registered action through `server.invoke` or a transport when registration, policy or validation changes.
7. Do not commit, publish or change secrets, `.env` values or deployment settings unless the user asks.

## Common pitfalls

- `isProtected` without `auth` does nothing useful. Configure both.
- `accessControl` does not block anything by itself. Add a hook that checks it.
- A before hook sees the raw payload, before validation.
- A global before hook's returned value does not replace the payload. Use a local hook to transform input.
- A local hook does not protect the parent action.
- `context.set` values are shared by all requests. Never store the current user there.
- A rate limit or topic policy that is missing denies or does not apply. Read the feature page for the default.
- Multiple replicas each keep their own queues, schedules, rate-limit counters and WebSocket subscriptions.
- JWT failures return fixed messages such as `JWT authentication failed: token expired` or `JWT authentication failed: invalid token`. They never include the token or its claims, so do not add them back in your own logs.
- Import Results from `@nilejs/nile/fp`, not a separately installed `slang-ts`. Two copies of `slang-ts` produce type errors.
