# Nile Js

[![npm version](https://img.shields.io/npm/v/@nilejs/nile.svg)](https://www.npmjs.com/package/@nilejs/nile)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Nile Js is a functional TypeScript backend framework for small teams. Group your backend into services for business domains and actions for individual operations. Validation, error handling, logging and shared resources follow the same conventions as your application grows.

A teammate or coding agent can find a feature through its service, open the action and follow its business logic and data access. You write ordinary TypeScript functions for the rules of your product.

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

```ts
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

`createAction` infers its type from the handler. Register the action in a service, then call it through the frontend client or `server.invoke`. The [core package guide](https://github.com/nile-js/nile/blob/main/packages/nile/README.md) shows registration, startup and a client call.

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
