# Make ordinary failure paths easy to follow

A team should be able to see how an operation can fail beside its business logic. Nile handlers return `Ok(data)` or `Err(message)` from `slang-ts`, so expected failures become explicit branches.

```typescript
import { createAction } from "@nilejs/nile";
import { Err, Ok } from "slang-ts";
import { z } from "zod";

const schema = z.object({ name: z.string().trim().min(1) });
type CreateProjectInput = z.infer<typeof schema>;

export const createProject = createAction<CreateProjectInput>({
  name: "create",
  description: "Create a project",
  validation: schema,
  handler: (input) => {
    if (input.name.toLowerCase() === "system") {
      return Err("Choose a different project name");
    }
    return Ok({ project: { id: crypto.randomUUID(), name: input.name } });
  },
});
```

The schema checks the input shape before the handler. The guard expresses an application rule. A real persistence call would live in the application's model or repository.

## Handle an operation that can fail

Use `safeTry` around an external call or application function that can reject or throw. Inspect the Result, log useful internal context, and return an appropriate message to the caller.

```typescript
import { Err, Ok, safeTry } from "slang-ts";

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

## Keep the three boundaries distinct

| Boundary | Successful value | Failure |
|---|---|---|
| Handler | `Ok({ project })`, inspect with `isOk` / `value` | `Err(message)`, inspect with `isErr` / `error` |
| HTTP | `{ status: true, message, data }` | `{ status: false, message, data: {} }` for engine failures |
| Frontend client | `{ error: null, data }` | `{ error: message, data }`; data may be null or server error details |

Object handler values become HTTP `data` directly. Primitive, array or null values are wrapped as `{ result: value }`. Returning `{ project }` makes a frontend operation's shape explicit.

Action lookup, authentication, hook, validation and handler Result failures normally return HTTP **400**. A missing action is not an HTTP 404. Unknown HTTP routes return 404; disabled/denied discovery returns 403. Transport errors and custom routes have their own status behavior.

## Do not rely on thrown errors being private

Nile guards action and hook execution with `safeTry`. A thrown handler error can become a Result failure whose message reaches the caller. Catch potentially sensitive downstream failures at your application boundary and return a safe message deliberately. The transport's unexpected-error handler sanitizes its own 500 responses; that is a different boundary.

`handleError({ message, data, atFunction })` logs through an explicit or configured logger and returns an `Err` containing the log ID. It fails fast if no logger is available. Use it when that traceable message is appropriate for the caller, and keep confidential details in logged data.

Result handling does not make a multi-step operation transactional or undo earlier side effects. Keep those decisions in the domain/data layer.

Next: [hooks and their failure rules](/guide/basics/hooks-and-pipelines).
