---
title: "Input contracts"
description: "Keep action inputs, validation schemas and frontend contracts aligned"
---

A growing team benefits when the action schema, TypeScript input and frontend call describe the same operation. Nile gives those pieces a common shape, with explicit boundaries.

## Type an action's input

```ts
import { createAction, type ActionHandler } from "@nilejs/nile";
import { Ok } from "slang-ts";
import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().trim().min(1),
});
type CreateProjectInput = z.infer<typeof createProjectSchema>;

const handler: ActionHandler<CreateProjectInput> = (input) => {
  return Ok({ project: { id: crypto.randomUUID(), name: input.name } });
};

export const createProject = createAction<CreateProjectInput>({
  name: "create",
  description: "Create a project",
  validation: createProjectSchema,
  handler,
});
```

`Action<T, E>` and `ActionHandler<T, E>` use `T` for the handler **input** and `E` for its error type. They do not encode the output shape as `T`. `createAction` does not infer the handler input from the schema property; use an explicit generic or a typed handler.

The main action's schema parses input at runtime, including supported defaults and transforms. Keep the handler type aligned with the schema's parsed output (`z.infer`). Before hooks run before that parsing and must treat incoming values accordingly.

## Generate frontend inputs

```sh
bunx @nilejs/cli generate schema --output src/generated
```

The CLI imports the local service registry, extracts validation schemas and emits `schemas.ts` plus `types.ts`. `ServicePayloads` is the generated service/action input map used by the client. Actions without validation schemas are skipped by the generator; the CLI reports them.

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

Generated contracts are snapshots, so regenerate and share them with consumers when inputs change. Inspect generated types for transformed or custom schema types; JSON Schema cannot preserve every Zod runtime behavior.

## Understand the boundaries

| Boundary | What it checks |
|---|---|
| `createAction<Input>` | The handler input at compile time. |
| Main action `validation` | Incoming payload at runtime before its handler. |
| Service registry | A heterogeneous action collection; individual input types are erased for dispatch. |
| `createNileClient<ServicePayloads>` | Service name, action name and payload at compile time. |
| Client Result | `value` is a general record; the client does not infer the handler's output type. Validate `value` in application code if needed. |
| Discovery JSON Schema | A description of representable inputs, not execution of custom refinements or application policy. |

The client exports `ExternalResponse<T>` and `ClientResult<T>` (the `ClientOk` or `ClientErr` Result) for describing responses, but `invoke` does not infer an action's output or accept an output-type generic. Runtime schemas remain the application's correctness boundary, including when the caller is a coding agent.

Next: [frontend integration](/guide/basics/client) and [discovery](/guide/basics/discovery-and-agents).
