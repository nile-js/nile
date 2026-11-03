# Nile Js

[![npm version](https://img.shields.io/npm/v/@nilejs/nile.svg)](https://www.npmjs.com/package/@nilejs/nile)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Nile Js is a TypeScript-first, service and actions oriented backend framework. Built for small teams and coding agents that iterate fast.

Each business domain gets one folder, and each operation one file. Your hundredth feature follows the same layout as your first, so a teammate or coding agent knows where to look.

Included with every project:

- Input validation with Zod, with readable messages and field-level issues
- Errors returned as values, `Ok` or `Err`
- Before and after hooks, global or per action
- JWT authentication for protected actions
- Structured logging, and a shared context for your database and other resources
- Rate limiting for actions and HTTP routes
- Queues, debounce and throttle
- Retries with jitter for external calls
- Cron jobs on calendar, interval or one-time schedules
- File uploads with size, count and type limits
- Static file serving and custom routes
- CORS rules for the server and for each action
- Typed WebSocket topics over Socket.IO, with permissions on each topic
- API discovery, with input schemas for clients and coding agents
- OpenTelemetry traces and metrics
- Readiness reporting and graceful shutdown
- A startup check for your service layout
- A typed frontend client, and a CLI for scaffolding and generators
- Bun's native server, or Hono on Bun and Node.js
- Your own database, with Drizzle ORM helpers built in

[Documentation](https://nile-js.github.io/nile/guide/) · [Getting started](https://nile-js.github.io/nile/guide/start/getting-started/) · [Examples](https://nile-js.github.io/nile/guide/examples/)

## Create a project

```sh
bunx @nilejs/cli new my-app
cd my-app
bun install
bun run dev
```

The starter runs on Bun at `http://localhost:8000`. It includes a Tasks service and an embedded PGlite database.

## Write an action

An action is one operation your backend exposes, such as creating a project. It has a name, a Zod schema for its input and a handler. A service groups the actions of one business domain, and every call names one service and one action.

```ts
// src/services/projects/actions/create.ts
import { createAction } from "@nilejs/nile";
import { Ok } from "@nilejs/nile/fp";
import { z } from "zod";

const createProjectSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
});

type CreateProjectData = z.infer<typeof createProjectSchema>;

const createProjectHandler = (data: CreateProjectData) => {
  const project = {
    id: crypto.randomUUID(),
    name: data.name,
  };

  return Ok({ project: project });
};

export const createProjectAction = createAction({
  name: "create",
  description: "Create a project",
  validation: createProjectSchema,
  handler: createProjectHandler,
});
```

Nile checks the payload against `createProjectSchema` before the handler runs. When the check fails, the caller gets a readable message with each failing field, and the handler is skipped. The handler returns `Ok` with the data, or `Err` with a message for an expected failure. `createAction` infers the action's type from the handler.

Each action lives in its own file under its service. Register it in the projects service, then call it from the frontend client, or from your backend code with `server.invoke`. The [core package guide](https://github.com/nile-js/nile/blob/main/packages/nile/README.md) shows registration, startup and a client call.

## Packages

| Package | Use it for |
| --- | --- |
| [@nilejs/nile](https://www.npmjs.com/package/@nilejs/nile) | Server, actions, validation, hooks, logging and backend utilities |
| [@nilejs/cli](https://www.npmjs.com/package/@nilejs/cli) | Project scaffolding, action generators and client contracts |
| [@nilejs/client](https://www.npmjs.com/package/@nilejs/client) | Typed HTTP calls and Socket.IO topics |

Explore the [reference application](https://github.com/nile-js/nile/tree/main/packages/example), [documentation source](https://github.com/nile-js/nile/tree/main/packages/web) and [benchmark suite](https://github.com/nile-js/nile/tree/main/packages/benchmarks).

## Development

```sh
bun install
bun run --cwd packages/nile build
bun run --cwd packages/nile test:run
bun run --cwd packages/web build
```

Read [CONTRIBUTING.md](https://github.com/nile-js/nile/blob/main/CONTRIBUTING.md) for setup and contribution guidelines. When changing an existing application, start with the [migration notes](https://github.com/nile-js/nile/blob/main/packages/nile/docs/release-migration.md).

## Community

Join the [WhatsApp community](https://chat.whatsapp.com/K0xkSiilbVtFf3QZoA1z5Z?mode=gi_t) or report an issue on [GitHub](https://github.com/nile-js/nile/issues).

## License

MIT
