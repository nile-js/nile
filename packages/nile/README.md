# Nile Js

[![npm version](https://img.shields.io/npm/v/@nilejs/nile.svg)](https://www.npmjs.com/package/@nilejs/nile)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Nile Js is a TypeScript-first, service and actions oriented backend framework. Built for small teams and coding agents that iterate fast.

A service groups the actions of one business domain. An action is one operation: a name, a validation schema and a handler. Every call names one service and one action, and the handler returns `Ok` with data or `Err` with a message.

Each service is a folder in `src/services` with one file per action. Open the domain, find the action and follow it to the data access. Your team and your coding agent work from the same map.

[Documentation](https://nile-js.github.io/nile/guide/) · [Getting started](https://nile-js.github.io/nile/guide/start/getting-started/) · [Examples](https://nile-js.github.io/nile/guide/examples/)

## Create a project

```sh
bunx @nilejs/cli new my-app
cd my-app
bun install
bun run dev
```

The starter runs on Bun at `http://localhost:8000`. It includes a Tasks service, a PGlite database and generators for services, actions and client contracts.

To add Nile to an existing project:

```sh
bun add @nilejs/nile zod
```

## Write an action

Define the schema, derive the data type and write a named handler. `createAction` infers the action type from the handler.

```ts
// src/services/tasks/actions/create.ts
import { createAction } from "@nilejs/nile";
import { Ok } from "@nilejs/nile/fp";
import { z } from "zod";

const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required"),
});

type CreateTaskData = z.infer<typeof createTaskSchema>;

const createTaskHandler = (data: CreateTaskData) => {
  const task = {
    id: crypto.randomUUID(),
    title: data.title,
    status: "pending",
  };

  return Ok({ task: task });
};

export const createTaskAction = createAction({
  name: "create",
  description: "Create a task",
  validation: createTaskSchema,
  handler: createTaskHandler,
});
```

This action returns a task. Add a model call to the handler when you want to save it. Use `Err(message)` for an expected failure and check a model’s Result before reading its value.

## Register the service

Keep each domain’s actions in its service entry point:

```ts
// src/services/tasks/index.ts
import { createService } from "@nilejs/nile";
import { createTaskAction } from "./actions/create";

export const tasksService = createService({
  name: "tasks",
  description: "Task management",
  actions: [createTaskAction],
});
```

Register the service in the application:

```ts
// src/services/services.config.ts
import { createServices } from "@nilejs/nile";
import { tasksService } from "./tasks";

export const services = createServices([tasksService]);
```

## Start the server

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
    allowedOrigins: ["http://localhost:3000"],
  },
});

if (server.nativeRest) {
  Bun.serve({
    port: 8000,
    fetch: server.nativeRest.fetch,
  });
}
```

Nile checks your source layout at startup. Each service needs an `index.ts` and an `actions/` directory, alongside the application’s `services.config.ts` registry. See [application structure](https://nile-js.github.io/nile/guide/start/application-structure/) for larger actions, shared modules and startup settings.

You can also use the [Hono adapter on Bun or Node.js](https://nile-js.github.io/nile/guide/start/runtime-adapters/).

## Call the action

Install the frontend client:

```sh
bun add @nilejs/client
```

```ts
import { createNileClient } from "@nilejs/client";

const nile = createNileClient({
  baseUrl: "http://localhost:8000/api",
});

const result = await nile.invoke({
  service: "tasks",
  action: "create",
  payload: { title: "Ship the next feature" },
});

if (result.isErr) {
  console.error(result.error);
} else {
  console.log(result.value);
}
```

Generate `ServicePayloads` with `bun run gen schema` and pass it to `createNileClient<ServicePayloads>` for service names, action names and payload checking. Within your backend, call the same operation with `server.invoke`.

HTTP action calls use `POST /api/services` with `intent`, `service`, `action` and `payload`. Responses contain exactly `status`, `message` and `data`:

```json
{
  "status": true,
  "message": "Action completed.",
  "data": {
    "task": {
      "id": "aa5f730d-b2ce-40fa-8b74-98f6ea4ab271",
      "title": "Ship the next feature",
      "status": "pending"
    }
  }
}
```

## Handle failures

An action returns `Ok(value)` or `Err(message)`. Import Results, Options and async helpers from `@nilejs/nile/fp`. Nile-specific helpers, including optional Drizzle models, are available through `utils` from `@nilejs/nile`.

Validation failures include a readable message, a unique `data.errorCode` and field-level `data.issues`. The client exposes the message as `result.error` and failure data as `result.details`.

Unexpected errors return a safe message with a generated reference matching the log’s `log_id`. Keep database and provider details in your logs. Use `safeTry` to catch dependency failures and `utils.handleError` to log diagnostics with a message suitable for the caller. See [errors and Results](https://nile-js.github.io/nile/guide/basics/errors-and-results/) for examples.

## Apply shared policies with hooks

A global before hook can check access before an action runs. This hook allows an action when the session contains at least one role from its `accessControl` list:

```ts
import type { BeforeActionHandler } from "@nilejs/nile";
import { Err, Ok } from "@nilejs/nile/fp";

export const authorizeAction: BeforeActionHandler<boolean, string> = (
  hookContext
) => {
  const requiredRoles = hookContext.action.accessControl ?? [];
  if (requiredRoles.length === 0) {
    return Ok(true);
  }

  const session = hookContext.nileContext.getSession("rest");
  const roles = session?.roles;
  if (!Array.isArray(roles)) {
    return Err("You do not have access to this action");
  }

  const allowed = requiredRoles.some((role) => roles.includes(role));
  if (!allowed) {
    return Err("You do not have access to this action");
  }

  return Ok(true);
};
```

Set `onBeforeActionHandler` to `authorizeAction` in your server configuration. Your authentication setup supplies the session. Actions can also compose local before and after hooks. See [authentication and hooks](https://nile-js.github.io/nile/guide/features/authentication-and-hooks/).

## Add what your application needs

| Task | Guide |
| --- | --- |
| Share a database, logger and other resources | [Context and logging](https://nile-js.github.io/nile/guide/features/context-and-logging/) |
| Send and receive typed topic messages over Socket.IO | [WebSockets](https://nile-js.github.io/nile/guide/features/websockets/) |
| Run recurring or one-time jobs | [Cron jobs](https://nile-js.github.io/nile/guide/features/cron-jobs/) |
| Limit calls and concurrent work | [Rate limiting](https://nile-js.github.io/nile/guide/features/rate-limiting/) and [queues](https://nile-js.github.io/nile/guide/features/queues-debounce-throttle/) |
| Save and query data with Drizzle helpers | [Database models](https://nile-js.github.io/nile/guide/features/database-models/) |
| Accept files | [File uploads](https://nile-js.github.io/nile/guide/features/file-uploads/) |
| Export schemas for clients and coding agents | [API discovery](https://nile-js.github.io/nile/guide/features/api-discovery/) |
| Trace actions and collect metrics | [Telemetry](https://nile-js.github.io/nile/guide/features/telemetry/) |
| Inspect startup service and action counts | [Server setup](https://nile-js.github.io/nile/guide/internals/server/) |
| Close resources during shutdown | [Readiness and shutdown](https://nile-js.github.io/nile/guide/features/readiness-and-shutdown/) |

## Work with a coding assistant

The starter includes `SKILL.md` with the service layout, action pattern, FP helpers and common mistakes. After an upgrade, use the copy at `node_modules/@nilejs/nile/SKILL.md`. See [skill setup](https://nile-js.github.io/nile/guide/agents/skill/) for your assistant.

## Requirements

Use Bun 1.4.2 or later for Bun native. The Hono adapter supports Node.js 22.23.4+, 24.22.1+ and 26.12.1+. TypeScript 7 is a peer dependency.

For an existing application, read the [migration notes](https://github.com/nile-js/nile/blob/main/packages/nile/docs/release-migration.md) before upgrading.

## Community and contributing

Nile Js was created by Hussein Kizz at [Nile Squad Labz](https://nilesquad.com). Join the [WhatsApp community](https://chat.whatsapp.com/K0xkSiilbVtFf3QZoA1z5Z?mode=gi_t), report issues on [GitHub](https://github.com/nile-js/nile/issues), or read [CONTRIBUTING.md](https://github.com/nile-js/nile/blob/main/CONTRIBUTING.md).

## License

MIT
