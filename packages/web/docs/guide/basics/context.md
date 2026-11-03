---
title: "Shared context"
description: "Share application resources while keeping request identity and action state isolated"
---

Supply shared resources, such as a database and logger, when you create the server. Actions and hooks read them through `context.resources`.

```ts
import { createLogger, createNileServer } from "@nilejs/nile";
import { services } from "./services/services.config";

const logger = createLogger("team-workspace", { mode: "dev" });

const server = await createNileServer({
  serverName: "Team workspace",
  services,
  resources: { logger },
  runtime: "bun",
  native: true,
  rest: { baseUrl: "/api", allowedOrigins: ["http://localhost:3000"] },
});
```

Handlers receive context as their optional second argument:

```ts
import type { NileContext } from "@nilejs/nile";
import { Ok } from "@nilejs/nile/fp";

const createProjectHandler = (
  data: CreateProjectInput,
  context?: NileContext,
) => {
  const logger = context?.resources?.logger;

  if (logger !== undefined) {
    logger.info({
      atFunction: "createProject",
      message: "Creating a project",
      data: { name: data.name },
    });
  }

  return Ok({ project: { name: data.name } });
};
```

`CreateProjectInput` is inferred from the action's schema; pass the handler to `createAction` as `handler: createProjectHandler`. The logger writes only what you log, so add your own audit entries where you need them.

## Shared resources and request identity are different

| Context location | Scope |
|---|---|
| `resources` | Application-owned resources shared across requests. |
| `set(key, value)` / `get(key)` for ordinary keys | Shared application key-value storage. |
| `get("rest")` | Current request's Hono context, on the Hono adapter. |
| `get("nativeRest")` | Current request's native HTTP context, on Bun native. |
| `getSession("rest")` / `setSession("rest", value)` | Current request's session. Both HTTP adapters use this session key. |
| `hookContext`, `updateHookState` | State and logs isolated to the current action execution. |
| `socket` | Topic messaging, present when the server has `socket` config. Use `getContext({ topics })` for typed topics. |

Keep the current user out of `set("user", ...)`: every concurrent request reads the same shared value. Use request sessions for identity and hook state for per-call work. Request contexts and sessions follow each request through AsyncLocalStorage, and nested or concurrent action calls each get their own hook state.

```ts
const session = context?.getSession("rest");
const userId = session?.userId;
```

Outside a request, `getSession` returns `undefined` and `setSession` has no effect. In your own helpers, pass the dependency as a parameter; the helper is then easier to reuse and test.

## Get a typed resource when needed

`getContext<TDatabase>()` returns the active Nile context with a typed database resource. Call it near the edge of your app, such as a startup module, and pass the database to model factories as a parameter. Any database works.

```ts
import { getContext } from "@nilejs/nile";
import type { AppDatabase } from "../db/types";

const context = getContext<AppDatabase>();
const database = context.resources?.database;
```

`AppDatabase` is your application's database type. `getContext` throws until `createNileServer` has run, so create the server first.

Next: [authentication and access policy](/guide/basics/auth), [hooks](/guide/basics/hooks-and-pipelines), and [runtime-specific request access](/guide/start/runtime-adapters).
