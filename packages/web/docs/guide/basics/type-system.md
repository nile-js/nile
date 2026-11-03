---
title: "Input contracts"
description: "Keep action inputs, validation schemas and frontend contracts aligned"
---

Derive handler data from its validation schema and generate frontend payload types from the registered actions. Type the data once and let TypeScript infer the action type and the handler’s return type.

## Type an action's input

```ts
import { createAction } from "@nilejs/nile";
import { Ok } from "@nilejs/nile/fp";
import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().trim().min(1),
});
type CreateProjectInput = z.infer<typeof createProjectSchema>;

const createProjectHandler = (data: CreateProjectInput) => {
  return Ok({ project: { id: crypto.randomUUID(), name: data.name } });
};

export const createProject = createAction({
  name: "create",
  description: "Create a project",
  validation: createProjectSchema,
  handler: createProjectHandler,
});
```

`Action<T, E>` and `ActionHandler<T, E>` use `T` for handler data and `E` for the error type. Annotate the named handler’s data once; `createAction` infers the action type from it.

The main action's schema parses input at runtime, including supported defaults and transforms. Keep the handler type aligned with the schema's parsed output (`z.infer`). Before hooks run before that parsing, so they see the raw payload.

## Generate frontend inputs

```sh
bunx @nilejs/cli generate schema --output src/generated
```

The CLI imports the local service registry, extracts validation schemas and emits `schemas.ts` plus `types.ts`. `ServicePayloads` is the generated service/action input map used by the client. Actions without a validation schema receive an object payload type, so calls such as `tasks.list` accept `{}`. Conversion failures are reported separately.

```ts
import { createNileClient } from "@nilejs/client";
import type { ServicePayloads } from "./generated/types";

const nile = createNileClient<ServicePayloads>({ baseUrl: "/api" });
const result = await nile.invoke({
  service: "projects",
  action: "create",
  payload: { name: "Customer portal" },
});

if (result.isErr) {
  console.error(result.error);
  return;
}
```

Generated contracts are snapshots: regenerate and share them when inputs change. Check the generated types for transformed or custom schemas, since JSON Schema cannot express every Zod runtime behavior.

## What is checked

| Where | What it checks |
|---|---|
| `createAction` | The handler input at compile time. |
| Main action `validation` | Incoming payload at runtime before its handler. |
| Service registry | Nothing per action: actions of every input type share one list. |
| `createNileClient<ServicePayloads>` | Service name, action name and payload at compile time. |
| Client Result | Nothing: `value` is a general record. Validate it in your application when you depend on its shape. |
| Discovery JSON Schema | Nothing at runtime: it describes the inputs JSON Schema can express, without your refinements or policies. |

The client exports `ExternalResponse<T>` and `ClientResult<T>` (the `ClientOk` or `ClientErr` Result) for typing responses yourself; `invoke` takes no output type. Generated types check the caller at compile time only, so the server still validates every payload.

Next: [frontend integration](/guide/basics/client) and [discovery](/guide/basics/discovery-and-agents).
