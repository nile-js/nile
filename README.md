# Nile Js

[![npm version](https://img.shields.io/npm/v/@nilejs/nile.svg)](https://www.npmjs.com/package/@nilejs/nile)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Nile Js is a TypeScript-first, service and actions oriented backend framework. Built for small teams and coding agents that iterate fast.

Each business domain gets one folder, and each operation one file. Your hundredth feature follows the same layout as your first, so a teammate or coding agent knows where to look.

This is not an evening project, Nile has taken me 2 years to get where it is today, I have been refining its developer experience, performance and ergonomics.

What's included in every project:

- Validation with Zod
- Errors as values
- Hooks
- JWT authentication
- Structured logging
- Rate limiting
- Queues, debounce and throttle
- Retries
- Cron jobs
- File uploads
- Static files and custom routes
- CORS
- WebSockets
- API discovery
- OpenTelemetry
- Readiness and graceful shutdown
- Typed frontend client
- CLI with generators
- Bun or Node.js, native or Hono
- Bring your own database, with Drizzle ORM helpers

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
// src/services/projects/actions/create-project.ts
import { createAction } from "@nilejs/nile";
import { Ok } from "@nilejs/nile/fp";
import { z } from "zod";

const createProjectSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
});

type CreateProjectInput = z.infer<typeof createProjectSchema>;

const createProjectHandler = (data: CreateProjectInput) => {
  const project = {
    id: crypto.randomUUID(),
    name: data.name,
  };

  return Ok({ project: project });
};

export const createProject = createAction({
  name: "create",
  description: "Create a project",
  validation: createProjectSchema,
  handler: createProjectHandler,
});
```

Nile checks the payload against `createProjectSchema` before the handler runs. When the check fails, the caller gets a readable message with each failing field, and the handler is skipped. The handler itself is a plain function: it receives typed data and returns a Result. `createAction` infers the action's type from it.

## Group actions into a service

```ts
// src/services/projects/index.ts
import { createService } from "@nilejs/nile";
import { createProject } from "./actions/create-project";

export const projects = createService({
  name: "projects",
  description: "Organize the team's projects",
  actions: [createProject],
});
```

```ts
// src/services/services.config.ts
import { createServices } from "@nilejs/nile";
import { projects } from "./projects";

export const services = createServices([projects]);
```

`services.config.ts` lists every service in the application, so one file shows everything your backend can do.

## Start the server

```ts
// src/index.ts
import { createNileServer } from "@nilejs/nile";
import { services } from "./services/services.config";

const server = await createNileServer({
  serverName: "Team workspace",
  runtime: "bun",
  native: true,
  services: services,
  rest: {
    baseUrl: "/api",
    allowedOrigins: ["http://localhost:3000"],
  },
});

if (!server.nativeRest) {
  throw new Error("Native adapter unavailable");
}

Bun.serve({ port: 8000, fetch: server.nativeRest.fetch });
```

Every action now answers at `POST /api/services`. On Node.js, use the [Hono adapter](https://nile-js.github.io/nile/guide/start/runtime-adapters/) instead.

## Call it from the frontend

```sh
bun add @nilejs/client
```

```tsx
// components/create-project-button.tsx
import { createNileClient } from "@nilejs/client";

const nile = createNileClient({
  baseUrl: "http://localhost:8000/api",
});

export function CreateProjectButton() {
  const handleClick = async () => {
    const result = await nile.invoke({
      service: "projects",
      action: "create",
      payload: { name: "Customer portal" },
    });

    if (result.isErr) {
      console.error(result.error);
      return;
    }

    console.log(result.value);
  };

  return <button onClick={handleClick}>Create project</button>;
}
```

The call names the service and the action, and the payload is the action's input. One endpoint serves every action, and a new action is callable as soon as its service lists it. `invoke` returns a Result for every call, including network failures, so one `isErr` check covers every way the call can fail. After the check, `result.value` holds the data the handler returned.

Run `bun run gen schema` to generate `ServicePayloads`, then create the client with `createNileClient<ServicePayloads>`. Your editor completes service and action names and checks each payload against the action's schema.

## Errors as values

A Nile handler returns its failures instead of throwing them. `Ok(value)` carries the result. `Err(message)` carries an expected failure, and its message reaches the caller as written. Every outcome of an action is visible in its return statements.

```ts
// src/services/orders/actions/quote.ts
import { createAction } from "@nilejs/nile";
import { Err, Ok } from "@nilejs/nile/fp";
import { z } from "zod";
import { productModel } from "@/db/models";

const quoteSchema = z.object({
  id: z.string().min(1),
  quantity: z.number().int().positive(),
});

type QuoteData = z.infer<typeof quoteSchema>;

const quoteHandler = async (data: QuoteData) => {
  const product = await productModel.findById(data.id);
  if (product.isErr) {
    return Err("Product not found");
  }

  if (product.value.stock < data.quantity) {
    return Err("Not enough stock");
  }

  return Ok({ total: product.value.price * data.quantity });
};

export const quoteAction = createAction({
  name: "quote",
  description: "Quote a product order",
  validation: quoteSchema,
  handler: quoteHandler,
});
```

The model returns a Result too, so the handler checks `product.isErr` before reading `product.value`. The frontend handles the same two outcomes:

```tsx
// components/quote.tsx
const result = await nile.invoke({
  service: "orders",
  action: "quote",
  payload: { id, quantity },
});

if (result.isErr) {
  showError(result.error);
  return;
}

showTotal(result.value.total);
```

An unexpected exception is still caught. The caller receives a safe message with a reference, and the details go to your logs under the same reference. Results, Options and async helpers come from `@nilejs/nile/fp`. See [errors and Results](https://nile-js.github.io/nile/guide/basics/errors-and-results/).

## Next steps

| Read | To |
| --- | --- |
| [Application structure](https://nile-js.github.io/nile/guide/start/application-structure/) | Lay out services, models and shared modules |
| [Authentication and hooks](https://nile-js.github.io/nile/guide/features/authentication-and-hooks/) | Protect actions and run checks before or after them |
| [Database models](https://nile-js.github.io/nile/guide/features/database-models/) | Save and query data with the Drizzle helpers |
| [Context and logging](https://nile-js.github.io/nile/guide/features/context-and-logging/) | Share a database, a logger and other resources |
| [WebSockets](https://nile-js.github.io/nile/guide/features/websockets/) | Send and receive typed topic messages |
| [Features](https://nile-js.github.io/nile/guide/features/) | Every other feature, one guide each |
| [Coding agents](https://nile-js.github.io/nile/guide/agents/) | Give your assistant the Nile skill |

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
