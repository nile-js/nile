---
title: "Actions"
description: "Define an operation with input validation, access rules and a Result"
---

Keep an operation’s name, validation schema and handler together. The schema defines the data the handler receives, and the handler calls your domain logic and returns a Result.

```ts
import { createAction } from "@nilejs/nile";
import { Ok } from "@nilejs/nile/fp";
import { z } from "zod";

const createProjectSchema = z.object({
  name: z.string().trim().min(1),
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
  description: "Create a team project",
  validation: createProjectSchema,
  handler: createProjectHandler,
});
```

The example returns a project without saving it. In your application, the handler calls a model or domain function and returns its Result.

## Keep the contract close to the work

| Setting | Purpose |
|---|---|
| `name`, `description` | Name and explain the operation. |
| `validation` | A Zod schema parsed before the handler runs. Without it, the handler receives the payload as sent. |
| `handler` | Receives the parsed input and the Nile context, and returns a Result or a promise of one. |
| `successMessage` | The response message for a successful call. A handler's `Ok(value, message)` takes precedence. See [errors and Results](/guide/basics/errors-and-results). |
| `isProtected` | Requires built-in JWT verification. Takes effect only when the server has `auth`. |
| `hooks.before`, `hooks.after` | Registered actions to run before or after this one. |
| `accessControl` | Role strings for your own hooks to check. Nile stores them and enforces nothing. |
| `visibility.rest` | `false` hides the action from REST discovery and schema results. HTTP calls to it still run, so protect it with `isProtected` or a hook. |
| `visibility.rpc` | `false` refuses `server.invoke` calls to the action. |
| `cacheSchema` | Set `false` to convert this action's discovery schema on each request. |
| `cors` | Inherit CORS, override its options, or set `false` for this action's response headers. |
| `isSpecial` | Declare multipart or other content-type expectations. |
| `result.pipeline` | Include local hook execution logs in the returned data. |
| `meta` | Your own metadata. Nile stores it and acts on none of it. |

`createAction` infers the data type from the handler. For a named handler, derive its data type with `z.infer` and annotate the `data` parameter. Let TypeScript infer the handler’s return type and the action type.

Use [services](/guide/basics/services) to group actions, [Results](/guide/basics/errors-and-results) for failure paths, and [hooks](/guide/basics/hooks-and-pipelines) for shared policy.
