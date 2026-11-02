---
title: "Handler context"
description: "Read shared resources, sessions and execution details from an action handler"
---

Use `data` for the action’s validated data and `context` for its execution context. Nile passes context for HTTP calls, sockets, `server.invoke` and scheduled actions.

## Signature

Derive the data type from the schema and annotate the named handler. `createAction` infers its type from the handler.

```ts
import { createAction, type NileContext } from "@nilejs/nile";
import { Ok } from "@nilejs/nile/fp";
import { z } from "zod";

const createProjectSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
});

type CreateProjectData = z.infer<typeof createProjectSchema>;

const createProjectHandler = (
  data: CreateProjectData,
  context?: NileContext
) => {
  const project = {
    id: crypto.randomUUID(),
    name: data.name,
  };

  context?.resources?.logger?.info({
    atFunction: "createProject",
    message: "Project created",
    data: { projectId: project.id },
  });

  return Ok({ project: project });
};

export const createProjectAction = createAction({
  name: "create",
  description: "Create a project",
  validation: createProjectSchema,
  handler: createProjectHandler,
});
```

Supply the logger through `resources.logger` when creating the server. Logs written during an action include its execution identifier.

The handler type makes context optional, so you can call a handler directly in a unit test. Use `?.` for optional resources. If an operation requires a resource or session, check for it before continuing.

## Read execution details

| Value | Use it for |
| --- | --- |
| `context.resources` | Shared resources supplied when the server starts, such as a database and logger |
| `context.getSession("rest")` | The verified HTTP session, or an identity supplied by your authentication integration |
| `context.getSession("ws")` | The current socket session |
| `context.execution.requestId` | Correlating work and logs within an execution |
| `context.execution.transport` | Identifying the transport used for this call |
| `context.execution.signal` | Passing cancellation to a database, provider or other dependency |
| `context.execution.clientKey` | Applying a policy using the resolved client identity |
| `context.hookContext` | State, output, failures and logs for the current action pipeline |

Read optional execution fields with `?.`, for example `context?.execution?.signal`. Dependencies must honor the signal for cancellation to stop their work. A deadline does not roll back completed writes.

## Share state within an action

Use `context.updateHookState(name, value)` to pass a value between a handler and its local hooks. Read it through `context.hookContext.state`. Each concurrent or nested action execution has its own state.

Application-defined keys written with `context.set` are shared across the process. Keep current users in scoped sessions and per-action state in `hookContext`.

See [composing hooks](/guide/advanced/composing-hooks) for a complete pipeline.

## Get context in a helper

An ordinary helper called from an action can use `getContext` to read the same resources:

```ts
import { getContext } from "@nilejs/nile";

export const logProjectArchived = (projectId: string) => {
  const context = getContext();
  context.resources?.logger?.info({
    atFunction: "logProjectArchived",
    message: "Project archived",
    data: { projectId: projectId },
  });
};
```

Call `getContext` after server initialization. Pass a dependency explicitly when a helper should also run outside Nile, such as in a standalone script or domain unit test.

## Publish topic messages

Use the context’s typed socket interface to publish messages from an action. Declare the topics and their data schemas in your backend, then configure them under `websocket`. The [WebSockets guide](/guide/features/websockets) shows topic definitions, access policies and a named action handler.

## See also

- [Context and resources](/guide/basics/context)
- [Logging](/guide/internals/logging)
- [Testing actions](/guide/advanced/testing-actions)
