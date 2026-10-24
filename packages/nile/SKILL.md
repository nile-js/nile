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
src/services/<service>/actions/<action>.ts   one createAction per file
src/db/                      Drizzle client, schema, models (create-model helpers)
```

Create a project with `bunx @nilejs/cli new my-app`. Start it with `bun run dev`. Generate code with `bun run gen service <name>` and `bun run gen action <service> <action>`. Generate Zod schemas and types from validations with `bun run gen schema`.

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

Register it in `services.config.ts`:

```ts
export const services: Services = createServices([
  {
    name: "projects",
    description: "Project operations",
    actions: [createProjectAction],
  },
]);
```

Action names are unique within a service. Folder names do not create routes; only the registry does.

## Handlers take (data, context)

Nile Js calls every handler with two arguments: the validated input and the execution's `NileContext`. The type marks the context optional, so read its fields with `?.`:

```ts
const handler = (input: Input, context?: NileContext<unknown>) => {
  const session = context?.getSession("rest");
  const logger = context?.resources?.logger;
  // ...
};
```

- `context.getSession("rest")` returns the verified JWT identity (`userId`, `organizationId` and other claims) for a protected action.
- `context.resources` holds what `createNileServer` received (`logger`, `database`).
- `context.execution` holds `requestId`, `transport`, `signal` and `clientKey`.
- `context.updateHookState` and `context.hookContext.state` are per execution. `context.set` and `context.get` are shared by every request in the process.
- `getContext<T>()` returns the context outside a handler. It throws before `createNileServer` runs.

## Results

Handlers return `Ok(value)` or `Err(message)` from `@nilejs/nile/fp`, which re-exports `slang-ts`. Check `isErr` before reading `value`. Use `safeTry` around a call that can throw or reject. Use `handleError({ message, data })` from `@nilejs/nile` to log an error and return it as an `Err` in one step.

The success `message` defaults to `Action 'service.action' executed`. Set `successMessage` on the action, or return `Ok(value, message)` to choose one per call; the handler's message wins.

HTTP envelope: success is `{ status: true, message, data }`. Failure is `{ status: false, message, data }` with HTTP 400. Validation failures put field paths in `data.issues`, for example `[{ "path": "address.city", "message": "City is required" }]`.

## Calling actions

- HTTP: `POST /api/services` with `{ "intent": "execute", "service": "projects", "action": "create", "payload": { ... } }`.
- Client (`@nilejs/client`): `createNileClient<Payloads>({ baseUrl })`, then `await nile.invoke({ service, action, payload })`. Every method returns a Result: `if (result.isErr) { ... return; }`, then read `result.value`. On failure `result.error` is the message and `result.details` holds the server's `data`. `data` is a deprecated alias; do not use it.
- Server code: `await server.invoke({ service, action, payload, credentials? })`. Protected actions need `credentials` with headers.
- Uploads: `nile.upload({ service, action, files, fields })` for `isSpecial: { contentType: "multipart/form-data" }` actions. A JSON request to such an action returns HTTP 400.

## Protection and policy

- JWT: set `auth: { secret, method: "header" }` on the server and `isProtected: true` on the action. Both are required.
- `accessControl` lists role labels. Nile Js stores them but does not enforce them. Enforce them in a global `onBeforeActionHandler` that checks `action.accessControl` against the session's `roles`.
- Hooks: `hooks.before` and `hooks.after` run another action's handler directly. They do not run that action's JWT check, validation or hooks.
- Discovery is off by default. When enabled, `explore` and `schema` need `payload.discoverySecret`.

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

1. Read `services.config.ts` and the target service's actions before you change anything.
2. Follow the existing pattern in that service. Do not add a second architecture.
3. Never invent an API. Check the guide, the installed `@nilejs/nile` types in `node_modules`, or the existing code. If it is not there, say so.
4. Use named schemas, inferred input types, named handlers, `createAction<T>` and braces on every `if`.
5. Put business rules in the handler and persistence in the model or repository, not in the action file.
6. Run `./node_modules/.bin/tsc --noEmit` after every edit and fix each error before you continue.
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
