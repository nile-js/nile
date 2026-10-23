# Nile Js

[![NPM Version](https://img.shields.io/npm/v/@nilejs/nile.svg)](https://www.npmjs.com/package/@nilejs/nile)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

TypeScript-first, service and actions oriented backend framework.

You write actions, group them into services, and Nile Js gives you a predictable API with validation, error handling and schema export. There are no route trees, controllers or middleware chains to maintain: each business operation lives in one familiar place, so small teams keep shipping as the backend grows.

[Documentation](https://nile-js.github.io/nile/) · [Getting started](https://nile-js.github.io/nile/guide/start/getting-started/) · [Features](https://nile-js.github.io/nile/guide/features/) · [Examples](https://nile-js.github.io/nile/guide/examples/)

## Install

### Start from the CLI (recommended)

```bash
bunx @nilejs/cli new my-app
cd my-app
bun install
bun run dev
```

The starter runs on Bun's native HTTP server with an embedded PGlite database, a `tasks` service and generators for new services and actions. See [`@nilejs/cli`](https://www.npmjs.com/package/@nilejs/cli).

### Add to an existing project

```bash
bun add @nilejs/nile zod slang-ts
```

For the database helpers (`createModel`, `getZodSchema`), also add Drizzle:

```bash
bun add drizzle-orm drizzle-zod
```

For frontends, use [`@nilejs/client`](https://www.npmjs.com/package/@nilejs/client).

## Quick start

### 1. Write an action

An action is a named schema, the input type inferred from it and a handler that returns `Ok` or `Err`.

```ts
// src/services/tasks/actions/create.ts
import { createAction } from "@nilejs/nile";
import { Ok } from "slang-ts";
import { z } from "zod";

const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required"),
});

type CreateTaskInput = z.infer<typeof createTaskSchema>;

const createTaskHandler = (input: CreateTaskInput) => {
  const task = {
    id: crypto.randomUUID(),
    title: input.title,
    status: "pending",
  };

  return Ok({ task: task });
};

export const createTaskAction = createAction<CreateTaskInput>({
  name: "create",
  description: "Create a task",
  validation: createTaskSchema,
  handler: createTaskHandler,
});
```

### 2. Group actions into a service

```ts
// src/services/services.config.ts
import { createServices } from "@nilejs/nile";
import { createTaskAction } from "./tasks/actions/create";

export const services = createServices([
  {
    name: "tasks",
    description: "Task management",
    actions: [createTaskAction],
  },
]);
```

### 3. Start the server

```ts
// src/index.ts
import { createNileServer } from "@nilejs/nile";
import { services } from "./services/services.config";

const server = await createNileServer({
  serverName: "my-app",
  runtime: "bun",
  native: true,
  services: services,
  rest: {
    baseUrl: "/api",
    port: 8000,
    allowedOrigins: ["http://localhost:3000"],
  },
});

if (server.nativeRest) {
  Bun.serve({ port: 8000, fetch: server.nativeRest.fetch });
}
```

Applications that leave out `native` use the Hono adapter on Bun or Node.js, available as `server.rest.app`. See [runtime adapters](https://nile-js.github.io/nile/guide/start/runtime-adapters/).

### 4. Call it

```bash
curl -X POST http://localhost:8000/api/services \
  -H "Content-Type: application/json" \
  -d '{"intent":"execute","service":"tasks","action":"create","payload":{"title":"Ship it"}}'
```

```json
{
  "status": true,
  "message": "Action 'tasks.create' executed",
  "data": {
    "task": { "id": "a1b2c3d4-...", "title": "Ship it", "status": "pending" }
  }
}
```

From a frontend, `@nilejs/client` returns the same Result shape as your handlers:

```ts
import { createNileClient } from "@nilejs/client";

const nile = createNileClient({ baseUrl: "http://localhost:8000/api" });

const result = await nile.invoke({
  service: "tasks",
  action: "create",
  payload: { title: "Ship it" },
});

if (result.isErr) {
  console.error(result.error);
} else {
  console.log(result.value);
}
```

## Requests and responses

Every request is a `POST` to `{baseUrl}/services` with the same body:

```ts
{
  intent: "explore" | "execute" | "schema",
  service: string, // a service name, or "*" for all
  action: string,  // an action name, or "*" for all
  payload: object  // the action's input; use {} when there is none
}
```

| Intent | What it does |
|---|---|
| `execute` | Validates the payload against the action's schema and runs the action. |
| `explore` | Lists services, or the actions in one service. |
| `schema` | Returns an action's input as JSON Schema, for clients, tools and AI agents. |

Every response has the same envelope:

```ts
{
  status: boolean, // true on success
  message: string, // a readable summary
  data: object     // the action's value, or {} on failure
}
```

When validation fails, `data.issues` lists each failed field:

```json
{
  "status": false,
  "message": "Validation failed: ✖ Title is required\n  → at title",
  "data": {
    "issues": [{ "path": "title", "message": "Title is required" }]
  }
}
```

Discovery (`explore` and `schema`) is off unless you enable it with `rest.discovery`, and can require a secret. See [API discovery](https://nile-js.github.io/nile/guide/features/api-discovery/).

## Hooks

A global before hook runs for every action. Use it for shared policy, such as role checks:

```ts
import { type BeforeActionHandler, createNileServer } from "@nilejs/nile";
import { Err, Ok, type Result } from "slang-ts";
import { services } from "./services/services.config";

const requireSessionHook: BeforeActionHandler<boolean, string> = (
  hookInput
): Result<boolean, string> => {
  if (!hookInput.action.isProtected) {
    return Ok(true);
  }

  const session = hookInput.nileContext.getSession("rest");
  if (session === undefined) {
    return Err("Sign in to continue");
  }

  return Ok(true);
};

const server = await createNileServer({
  serverName: "my-app",
  services: services,
  onBeforeActionHandler: requireSessionHook,
});
```

Actions can also list local `hooks.before` and `hooks.after`, which reference other registered actions. For an executed action the order is:

```text
JWT check (protected actions)
  -> global before hook
    -> local before hooks
      -> validation
        -> handler
      -> local after hooks
  -> global after hook
-> response
```

Any failing step stops the rest, except a local hook marked `isCritical: false`. See [hooks and pipelines](https://nile-js.github.io/nile/guide/basics/hooks-and-pipelines/).

## What else is included

| Feature | Guide |
|---|---|
| JWT authentication and access policy | [Authentication and hooks](https://nile-js.github.io/nile/guide/features/authentication-and-hooks/) |
| Calls over HTTP, from other actions and from tests with `server.invoke` | [Calling actions](https://nile-js.github.io/nile/guide/features/calling-actions/) |
| Multipart file uploads with limits and type checks | [File uploads](https://nile-js.github.io/nile/guide/features/file-uploads/) |
| Socket.IO actions and typed topics | [WebSockets](https://nile-js.github.io/nile/guide/features/websockets/) |
| Rate limiting per action or per client | [Rate limiting](https://nile-js.github.io/nile/guide/features/rate-limiting/) |
| Cron schedules | [Cron jobs](https://nile-js.github.io/nile/guide/features/cron-jobs/) |
| Queues, debounce and throttle | [Queues, debounce and throttle](https://nile-js.github.io/nile/guide/features/queues-debounce-throttle/) |
| Retries and shared utilities | [Retries and utilities](https://nile-js.github.io/nile/guide/features/retries-and-utilities/) |
| Drizzle models with validation and pagination | [Database models](https://nile-js.github.io/nile/guide/features/database-models/) |
| Structured logging and shared resources | [Context and logging](https://nile-js.github.io/nile/guide/features/context-and-logging/) |
| Readiness checks and graceful shutdown | [Readiness and shutdown](https://nile-js.github.io/nile/guide/features/readiness-and-shutdown/) |
| Telemetry | [Telemetry](https://nile-js.github.io/nile/guide/features/telemetry/) |

## Startup statistics

At startup Nile Js prints a table of services with their action counts and registration times. Set `logServices: false` in `createNileServer` to turn it off. The same numbers are available in code:

```ts
const stats = server.stats();
console.table(stats.services);
// { totalServices, totalActions, registrationDurationMs, startupDurationMs,
//   services: [{ name, description, actionCount, registrationDurationMs }] }
```

All durations are in milliseconds. `startupDurationMs` covers server initialization, including `onBoot` and REST setup, but not module imports. Each call returns a fresh copy, and the numbers do not change after startup.

## Schema conversion

Nile Js converts an action's Zod schema to JSON Schema only when a discovery request first needs it, then caches the result. Startup and ordinary execution never convert schemas; validation always runs through Zod.

The cache is keyed by schema object, so later changes to a schema's descriptions or defaults are not picked up. To reconvert on every discovery request, set `cacheSchema: false` on an action or `rest.discovery.cacheSchemas: false` for the whole REST app.

## Hook execution context

Inside a handler or hook, `context.hookContext` holds that execution's state, output, errors and logs. Nested action calls get their own context and restore the parent's when they finish. Outside an execution, `context.hookContext` is a fallback, not the last request's state. To inspect hook logs after a call, set `result: { pipeline: true }` on the action and read the returned `pipeline` field.

## Using with coding assistants

The package ships `SKILL.md`, a guide for coding assistants that matches the installed version. After `bun install` it is at `node_modules/@nilejs/nile/SKILL.md`. See [the Nile Js skill](https://nile-js.github.io/nile/guide/agents/skill/) for setup.

## Requirements

- Bun 1.4.2 or later for the native transport and the CLI starter.
- Node.js 22.23.4+, 24.22.1+ or 26.12.1+ when you run the Hono adapter on Node.js.
- TypeScript 7 (a peer dependency). Zod 4 and slang-ts install with the package; list them in your own dependencies too, since your code imports them.

## Contributing

Nile Js was first built by Hussein Kizz at [Nile Squad Labz](https://nilesquad.com) to power its own B2B products, and is now open source. Read [CONTRIBUTING.md](https://github.com/nile-js/nile/blob/main/CONTRIBUTING.md) to get started, and join the [community](https://chat.whatsapp.com/K0xkSiilbVtFf3QZoA1z5Z?mode=gi_t) to ask questions.

## License

MIT
