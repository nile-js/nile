---
title: "Actions"
description: "Define an operation with input validation, access rules and a Result"
---

An action is a named business operation. Keep its description, input schema and handler together so a teammate can understand what it accepts and how it finishes without tracing a chain of route definitions.

```ts
import { createAction } from "@nilejs/nile";
import { Ok } from "slang-ts";
import { z } from "zod";

const createProjectSchema = z.object({
  name: z.string().trim().min(1),
});

type CreateProjectInput = z.infer<typeof createProjectSchema>;

const createProjectHandler = (input: CreateProjectInput) => {
  const project = {
    id: crypto.randomUUID(),
    name: input.name,
  };

  return Ok({ project: project });
};

export const createProject = createAction<CreateProjectInput>({
  name: "create",
  description: "Create a team project",
  validation: createProjectSchema,
  handler: createProjectHandler,
});
```

The example returns a project without persistence. In a real application, coordinate the business function or model from the handler and propagate its Result.

## Keep the contract close to the work

| Setting | Purpose |
|---|---|
| `name`, `description` | Name and explain the operation. |
| `validation` | A Zod schema parsed before the main handler. Omit it only when no schema validation is needed. |
| `handler` | Receive parsed input and optional Nile context; return a Result or a promise of a Result. |
| `isProtected` | Request built-in JWT verification **when server `auth` is also configured**. |
| `hooks.before`, `hooks.after` | Reference registered actions for reusable pipeline steps. |
| `accessControl` | Application-defined policy metadata; Nile does not enforce role strings automatically. |
| `visibility.rest` | Hide an action from detailed REST discovery/schema results. This is not an access-control policy. |
| `cacheSchema` | Set `false` to convert this action's discovery schema on each request. |
| `cors` | Inherit CORS, override its options, or set `false` for this action's response headers. |
| `isSpecial` | Declare multipart or other content-type expectations. |
| `result.pipeline` | Include local hook execution logs in the returned data. |
| `meta` | Attach application-defined metadata. No automatic caching or permissions are implied. |

`createAction` preserves your definition; it does not infer a handler's input from the `validation` property. Derive the input type with `z.infer` and pass it explicitly, as above.

Use [services](/guide/basics/services) to group actions, [Results](/guide/basics/errors-and-results) for failure paths, and [hooks](/guide/basics/hooks-and-pipelines) for shared policy.
