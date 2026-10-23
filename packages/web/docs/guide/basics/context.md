---
title: "Shared context"
description: "Share application resources while keeping request identity and action state isolated"
---

A growing application often needs the same logger, database client or cache across many operations. Supply long-lived resources once and read them through Nile context instead of building a new dependency container for every action.

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
import { Ok } from "slang-ts";

const createProjectHandler = (
  input: CreateProjectInput,
  context?: NileContext<unknown>,
) => {
  const logger = context?.resources?.logger;

  if (logger !== undefined) {
    logger.info({
      atFunction: "createProject",
      message: "Creating a project",
      data: { name: input.name },
    });
  }

  return Ok({ project: { name: input.name } });
};
```

This handler assumes `CreateProjectInput` is inferred from the action's schema; pass it to `createAction` as `handler: createProjectHandler`. Logging happens where you configure or call it; a logger resource does not automatically create an audit record for every request.

## Shared resources and request identity are different

| Context location | Scope |
|---|---|
| `resources` | Application-owned resources shared across requests. |
| `set(key, value)` / `get(key)` for ordinary keys | Shared application key-value storage. |
| `get("rest")` | Current request's Hono context, on the Hono adapter. |
| `get("nativeRest")` | Current request's native HTTP context, on Bun native. |
| `getSession("rest")` / `setSession("rest", value)` | Current request's session. Both HTTP adapters use this session key. |
| `hookContext`, `updateHookState` | State and logs isolated to the current action execution. |

Do not store the current user in a shared `set("user", ...)` key. Concurrent requests would observe the same application value. Use request sessions for identity and action hook state for per-execution work. Transport request contexts and sessions are carried through AsyncLocalStorage; nested/concurrent action executions get their own hook state.

```ts
const session = context?.getSession("rest");
const userId = session?.userId;
```

Outside a request scope, session access returns no session and session writes have no effect. For application helpers, passing the required dependency as a parameter often makes reuse and testing clearer than looking up context implicitly.

## Get a typed resource when needed

`getContext<TDatabase>()` exposes the active Nile context with a typed database resource. Keep that use at an application boundary; a model factory can receive the database explicitly. No particular database is required.

```ts
import { getContext } from "@nilejs/nile";
import type { AppDatabase } from "../db/types";

const context = getContext<AppDatabase>();
const database = context.resources?.database;
```

`AppDatabase` is your application's database type. `getContext` fails if no Nile instance is available, so initialize the application before calling it.

Next: [authentication and access policy](/guide/basics/auth), [hooks](/guide/basics/hooks-and-pipelines), and [runtime-specific request access](/guide/start/runtime-adapters).
