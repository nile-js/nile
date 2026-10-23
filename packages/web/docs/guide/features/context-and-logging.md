---
title: "Context and logging"
description: "Read shared resources, the current session and execution details from a handler, and write structured logs"
---

A handler receives the execution's `NileContext` as its second argument. Use it for shared resources such as the logger and database, the signed-in session, and the request identifier for correlating logs. Use the logger for records you choose to write.

## When to use it

Read `context.resources` when a handler needs the logger or database. Read `getSession("rest")` for the signed-in user. Read `context.execution` for the request ID, transport and cancellation signal. Use `updateHookState` for state that belongs to one execution. Use `set` and `get` only for application-wide values.

## Complete example

The server registers a logger and a database as resources. The handler writes one log entry per outcome and includes the request's identifiers in the data it logs.

```ts
import {
  createAction,
  createLogger,
  createNileServer,
  createServices,
  type NileContext,
} from "@nilejs/nile";
import { Err, Ok } from "slang-ts";
import { z } from "zod";

const logger = createLogger("team-workspace", {
  mode: "prod",
  chunking: "daily",
});

const renameProjectSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().trim().min(1, "Name is required"),
});

type RenameProjectInput = z.infer<typeof renameProjectSchema>;

const renameProjectHandler = (
  input: RenameProjectInput,
  context?: NileContext<unknown>
) => {
  const activeLogger = context?.resources?.logger;

  if (input.name === "system") {
    activeLogger?.warn({
      atFunction: "renameProject",
      message: "Rejected a reserved project name",
      data: { projectId: input.projectId },
    });
    return Err("Choose a different project name");
  }

  activeLogger?.info({
    atFunction: "renameProject",
    message: "Project renamed",
    data: { projectId: input.projectId },
  });

  return Ok({ projectId: input.projectId, name: input.name });
};

const renameProjectAction = createAction<RenameProjectInput>({
  name: "rename",
  description: "Rename a project",
  validation: renameProjectSchema,
  handler: renameProjectHandler,
});

const services = createServices([
  {
    name: "projects",
    description: "Project operations",
    actions: [renameProjectAction],
  },
]);

export const server = await createNileServer({
  serverName: "team-workspace",
  services: services,
  resources: { logger: logger },
  rest: { baseUrl: "/api", allowedOrigins: ["https://app.example.com"] },
});
```

Handlers are typed with `NileContext<unknown>` and read optional fields with `?.`. Nile passes the context on every call, including `server.invoke` calls. The fields are optional because your handler can also be called from a test or a background job that has no request.

With the logger above, `createLogger` writes structured lines to `logs/` relative to the working directory. The starter's startup line looks like this:

```text
22:31:21.321 INFO  onBoot my-app booted - PGLite schema ready
```

## What the context gives you

| Location | Scope | Use it for |
| --- | --- | --- |
| `context.resources` | Shared across requests, set at server creation | Logger, database and other application resources |
| `context.getSession("rest")` | One request | Verified identity from `auth`, such as `userId` and `organizationId` |
| `context.execution` | One execution | `requestId`, `transport`, `signal`, `clientKey`, optional `traceId` |
| `context.updateHookState(key, value)` and `context.hookContext.state` | One action execution | Values passed between hooks and the handler |
| `context.set(key, value)` and `context.get(key)` | Shared by every request | Application-wide values, such as a feature flag |

Use `getContext<AppDatabase>()` outside a handler when you need the typed resources, for example in a module that does not receive the context. It throws if the server has not been created.

## Logger options

| Option | Values | Effect |
| --- | --- | --- |
| `mode` | `"prod"`, `"dev"`, `"agentic"` | Output format. `dev` is readable in a terminal, `prod` is structured for collection. |
| `chunking` | `"none"`, `"daily"`, `"weekly"`, `"monthly"` | How files are split under `logs/`. Nile does not delete old files. |

Each entry includes the application name, the function name you pass as `atFunction`, the message, your optional `data` and a log ID. Nile attaches execution IDs to related log entries.

## Limits

- `context.set` writes to a map in this process. Other instances do not see it, and a restart clears it.
- A logger resource does not record every request. Log the events you need.
- Time-based chunking does not ship or delete logs. Plan retention for your deployment.

## Common mistakes

- Storing the current user with `set("user", ...)`. Concurrent requests share that value. Read the session instead.
- Logging passwords, tokens or personal data in `data`. Log identifiers and outcomes.
- Calling `getContext` at module load before `createNileServer` has run.
- Assuming `context.execution` exists outside an execution. Read it with `?.`.

## See also

- [Context](/guide/basics/context) explains shared and request-scoped state.
- [Logging](/guide/internals/logging) covers file layout and reading logs.
- [Production operations](/guide/reference/operations) describes execution IDs, telemetry and log filters.
