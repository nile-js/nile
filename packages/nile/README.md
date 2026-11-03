# Nile Js

[![npm version](https://img.shields.io/npm/v/@nilejs/nile.svg)](https://www.npmjs.com/package/@nilejs/nile)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Nile Js is a TypeScript-first, service and actions oriented backend framework. Built for small teams and coding agents that iterate fast.

Each business domain gets one folder, and each operation one file. Your hundredth feature follows the same layout as your first, so a teammate or coding agent knows where to look.

Not an evening project, Nile has so far taken me 2 years to get where it is today, refining its developer experience and performance and ergonomics.

Included with every project:

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

The starter runs on Bun at `http://localhost:8000`. It includes a Tasks service, a PGlite database and generators for services, actions and client contracts.

To add Nile to an existing project:

```sh
bun add @nilejs/nile zod
```

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

Nile checks your source layout at startup. Each service needs an `index.ts` and an `actions/` directory, alongside the application’s `services.config.ts` registry. See [application structure](https://nile-js.github.io/nile/guide/start/application-structure/) for larger actions, shared modules and startup settings.

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

Over HTTP, an action call is `POST /api/services` with `intent`, `service`, `action` and `payload`. Responses contain exactly `status`, `message` and `data`:

```json
{
  "status": true,
  "message": "Action completed.",
  "data": {
    "project": {
      "id": "aa5f730d-b2ce-40fa-8b74-98f6ea4ab271",
      "name": "Customer portal"
    }
  }
}
```

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

Validation failures include a readable message, a unique `data.errorCode` and field-level `data.issues`. The client exposes the message as `result.error` and failure data as `result.details`.

An unexpected exception is still caught. The caller receives a safe message with a reference, and the details go to your logs under the same reference. Use `safeTry` to catch dependency failures and `utils.handleError` to log diagnostics with a message suitable for the caller. Results, Options and async helpers come from `@nilejs/nile/fp`. See [errors and Results](https://nile-js.github.io/nile/guide/basics/errors-and-results/).

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
