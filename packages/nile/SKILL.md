---
name: nile
description: Work in a Nile Js backend (@nilejs/nile 1.x). Organize business operations as services and actions with Zod validation, Result returns, hooks, JWT protection and typed clients. Use when adding or changing actions, services, hooks, uploads, topics, schedules or the @nilejs/client calls in a Nile Js project.
license: MIT
---

# Working in a Nile Js application

Nile Js organizes a backend into **services** (business areas) and **actions** (one operation each). Read the project's `src/services/services.config.ts` first: it is the registry of every action the server exposes. Then read the action files of the service you change.

Documentation: https://nile-js.github.io/nile/guide/
Feature pages: https://nile-js.github.io/nile/guide/features/
Examples: https://nile-js.github.io/nile/guide/examples/
Every guide page is also listed in https://nile-js.github.io/nile/llms.txt

## Project layout (CLI starter)

```text
src/index.ts                 createNileServer, resources, rest config, Bun.serve
src/services/services.config.ts   the registry: createServices([...])
src/services/<service>/index.ts   createService: the domain and its public actions
src/services/<service>/actions/<action>.ts   one createAction per file
src/db/                      Drizzle client, schema, models (create-model helpers)
```

Create a project with `bunx @nilejs/cli new my-app`. Start it with `bun run dev`. Generate code with `bun run gen service <name>` and `bun run gen action <service> <action>`. Generate Zod schemas and accepted payload types from validations with `bun run gen schema`. Handler types describe parsed output (`z.infer`); client payload types describe input (`z.input`), so fields with defaults can be omitted by callers.

Structure violations fail startup by default. An application needs `src/index.ts` or `src/server.ts`, `src/services/services.config.ts`, and each service’s `index.ts` and `actions/`. For a growing action, use `actions/archive/archive.ts`, an `index.ts` export and private helpers in `actions/archive/modules/`. Action entry points above 400 lines are reported for refactoring. `project: { root: ".", structure: "warn" }` reports violations without stopping; `false` disables inspection. Source-less bundles skip inspection unless a root is explicit.

## The action pattern

Every action uses a named schema, an inferred input type, a separately written named handler and `createAction<T>`:

```ts
import { createAction } from "@nilejs/nile";
import { Err, Ok } from "@nilejs/nile/fp";
import { z } from "zod";

const createProjectSchema = z.object({
  name: z.string().trim().min(3, "Name must have at least 3 characters"),
});

type CreateProjectInput = z.infer<typeof createProjectSchema>;

const createProjectHandler = (input: CreateProjectInput) => {
  if (input.name === "system") {
    return Err("Choose a different project name");
  }

  return Ok({ project: { name: input.name } });
};

export const createProjectAction = createAction<CreateProjectInput>({
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

Nile Js calls every handler with two arguments: the validated input and the execution's `NileContext`. The type marks the context optional, so read its fields with `?.`:

Use `createAction<Input>` for the schema’s parsed output type, and import `NileContext` when annotating a named handler’s second argument. Read an optional context with `?.` or explicitly reject its absence before using it.

- `context.getSession("rest")` returns the verified JWT identity (`userId`, `organizationId` and other claims) for a protected action.
- `context.resources` holds what `createNileServer` received (`logger`, `database`).
- `context.execution` holds `requestId`, `transport`, `signal` and `clientKey`.
- `context.updateHookState` and `context.hookContext.state` are per execution. `context.set` and `context.get` are shared by every request in the process.
- `getContext<T>()` returns the context outside a handler. It throws before `createNileServer` runs.

## Results

Handlers return `Ok(value)` or `Err(message)` from `@nilejs/nile/fp`, which re-exports `slang-ts`. Check `isErr` before reading `value`. Use `safeTry` around a call that can throw or reject. Use `utils.handleError({ message, data })` with `import { utils } from "@nilejs/nile"` to log an error and return it as an `Err` in one step.

The success `message` defaults to `Action completed.`. Set `successMessage` on the action, or return `Ok(value, message)` to choose one per call; the handler's message wins.

HTTP envelope: success is `{ status: true, message, data }`. Failure is `{ status: false, message, data }`; inspect the envelope rather than assuming every failure has the same HTTP status. Validation failures use Zod’s prettified message (or an explicit validation message) and put a generated unique reference in `data.errorCode` alongside field paths in `data.issues`.

Slang 0.2.2 preserves caught causes on `result.raw`. `safeTry` returns a Result directly, including when the callback returns a Result; never expect a Result inside `result.value`. Nested `Ok(Ok(...))` and `Ok(Err(...))` are rejected. Return an existing Result directly.

`dbTry` is removed. For a database promise, use `safeTry`, inspect `result.raw` internally and pass `utils.describeError(result.raw)` to `utils.handleError` with a deliberate caller-safe message. `result.error` may contain driver text and must not be forwarded blindly. Unexpected throws inside Nile-managed work are logged and become `Error Code: <unique-code> - could not complete the action`. The generated reference matches the log’s `log_id`. Never use it as a stable error category. Custom success and intentional `Err` messages retain their wording.

`raw` is reserved for internal diagnostics and removed recursively from outgoing JSON and Socket.IO messages. Choose another name for public domain fields. Do not rely on that filter to sanitize secrets stored under other names.

## Calling actions

- HTTP: `POST /api/services` with `{ "intent": "execute", "service": "projects", "action": "create", "payload": { ... } }`.
- Client (`@nilejs/client`): `createNileClient<Payloads>({ baseUrl })`, then `await nile.invoke({ service, action, payload })`. Every method returns a Result: `if (result.isErr) { ... return; }`, then read `result.value`. On failure `result.error` is the message and `result.details` holds the server's `data`. `data` is a deprecated alias; do not use it.
- Sockets: `createNileSocketClient<Actions, Topics>` owns its connection. Use `socket.invoke`, `socket.send` and `socket.receive`; check each Result and unsubscribe/close when finished. Declare backend topics and validate their data and scope; frontend types come from shared or generated definitions. Authorization is still a backend policy.
- Server code: `await server.invoke({ service, action, payload, credentials? })`. Protected actions need `credentials` with headers.
- Uploads: `nile.upload({ service, action, files, fields })` for `isSpecial: { contentType: "multipart/form-data" }` actions. A JSON request to such an action returns HTTP 400.

## Keep operations practical

- Keep small single-use rules in the handler; add a domain function for reuse, complex rules or a transaction boundary.
- A write that needs to be atomic uses an application-owned database transaction. Calling several actions or adding an after hook does not make it atomic.
- Handle an error once at the layer that can choose a safe message, then propagate that Result. Do not repeatedly log the same failure.
- Treat before-hook payloads as untrusted: validation has not run yet. Use trusted identity, not an input field, for access decisions.
- Verify an action is in its service’s `actions` list, not merely exported. Test an important operation through the registered service.
- Keep queries, queue depth, concurrency and retries bounded. Only retry effects that are safe to repeat; use idempotency where needed.
- Configure optional features when needed. Keep framework configuration under its transport or feature block; do not invent an API to make an example work.

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
4. Use named schemas, inferred input types, named handlers, `createAction<T>` and braces on every `if`.
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
