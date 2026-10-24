---
title: "Errors and Results"
description: "Return expected failures and guard operations with Slang Results"
---

A team should be able to see how an operation can fail beside its business logic. Nile handlers return `Ok(data)` or `Err(message)` from `@nilejs/nile/fp`, Nile's re-export of [slang-ts](https://www.npmjs.com/package/slang-ts), so expected failures become explicit branches. Import every slang-ts helper from there; your code then shares Nile's copy and needs no separate dependency.

```ts
import { createAction } from "@nilejs/nile";
import { Err, Ok } from "@nilejs/nile/fp";
import { z } from "zod";

const createProjectSchema = z.object({
  name: z.string().trim().min(1),
});

type CreateProjectInput = z.infer<typeof createProjectSchema>;

const createProjectHandler = (input: CreateProjectInput) => {
  if (input.name.toLowerCase() === "system") {
    return Err("Choose a different project name");
  }

  const project = {
    id: crypto.randomUUID(),
    name: input.name,
  };

  return Ok({ project: project });
};

export const createProject = createAction<CreateProjectInput>({
  name: "create",
  description: "Create a project",
  validation: createProjectSchema,
  handler: createProjectHandler,
});
```

The schema checks the input shape before the handler. The guard expresses an application rule. A real persistence call would live in the application's model or repository.

## Handle an operation that can fail

Use `safeTry` around an external call or application function that can reject or throw. Inspect the Result, log useful internal context, and return an appropriate message to the caller.

```ts
import { Err, Ok, safeTry } from "@nilejs/nile/fp";

const saved = await safeTry(() => saveProject(input));
if (saved.isErr) {
  context?.resources?.logger?.error({
    atFunction: "createProject",
    message: "Project persistence failed",
    data: { error: String(saved.error) },
  });
  return Err("Could not create the project");
}
return Ok({ project: saved.value });
```

This handler fragment uses your application's `saveProject` function. Current `slang-ts` recursively unwraps nested Results, including a Result returned by that function. Do not wrap an existing successful Result merely to pass it through; returning it directly is often clearer.

## Send a success message

Every successful HTTP response carries a `message`. By default it reads `Action 'projects.archive' executed`. Set `successMessage` on the action for a fixed message, or pass a message as the second argument to `Ok` to choose one per call. The handler's message wins.

```ts
import { createAction } from "@nilejs/nile";
import { Ok } from "@nilejs/nile/fp";

export const archiveProject = createAction<ArchiveProjectInput>({
  name: "archive",
  description: "Archive a project",
  successMessage: "Project archived",
  validation: archiveProjectSchema,
  handler: (input) => {
    if (input.notifyTeam) {
      return Ok({ id: input.id }, "Project archived and the team notified");
    }
    return Ok({ id: input.id });
  },
});
```

Import `Ok` from `@nilejs/nile/fp`; Nile Js installs slang-ts 0.1.1 or later, which adds the message argument. The [frontend client](/guide/basics/client) exposes the message as `result.message`. WebSocket calls return the data only.

## Keep the three boundaries distinct

| Boundary | Successful value | Failure |
|---|---|---|
| Handler | `Ok({ project })`, inspect with `isOk` / `value` | `Err(message)`, inspect with `isErr` / `error` |
| HTTP | `{ status: true, message, data }` | `{ status: false, message, data: {} }` for engine failures |
| Frontend client | `{ isOk: true, isErr: false, value, error: null }` | `{ isOk: false, isErr: true, value: null, error: message, details }`; `details` holds any data the server attached |

Object handler values become HTTP `data` directly. Primitive, array or null values are wrapped as `{ result: value }`. Returning `{ project }` makes a frontend operation's shape explicit.

Action lookup, authentication, hook, validation and handler Result failures normally return HTTP **400**. A missing action is not an HTTP 404. Unknown HTTP routes return 404; disabled/denied discovery returns 403. Transport errors and custom routes have their own status behavior.

## Do not rely on thrown errors being private

Nile guards action and hook execution with `safeTry`. A thrown handler error can become a Result failure whose message reaches the caller. Catch potentially sensitive downstream failures at your application boundary and return a safe message deliberately. The transport's unexpected-error handler sanitizes its own 500 responses; that is a different boundary.

`handleError({ message, data, atFunction })` logs through an explicit or configured logger and returns an `Err` containing the log ID. It fails fast if no logger is available. Use it when that traceable message is appropriate for the caller, and keep confidential details in logged data.

Result handling does not make a multi-step operation transactional or undo earlier side effects. Keep those decisions in the domain/data layer.

Next: [hooks and their failure rules](/guide/basics/hooks-and-pipelines).
