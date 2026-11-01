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

This handler fragment uses your application's `saveProject` function. Slang 0.2.2 accepts a Result returned by that function, but rejects a Result nested inside another Result. Return an existing Result directly instead of wrapping it in `Ok`. Caught errors retain their original cause on the non-enumerable `raw` property.

## Send a success message

Every successful HTTP response carries a `message`. By default it reads `Action completed.`. Set `successMessage` on the action for a fixed message, or pass a message as the second argument to `Ok` to choose one per call. The handler's message wins.

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

## Validation failures

HTTP responses contain exactly `status`, `message` and `data`. For validation failures, `status` is false, the generated unique diagnostic reference is in `data.errorCode`, and the message uses Zod's `prettifyError`. Custom schema messages are preserved. Nile also retains the existing field-level `data.issues` for frontend forms.

```json
{
  "status": false,
  "message": "✖ Enter a project name.\n  → at name",
  "data": {
    "errorCode": "DHFg123Ab9Zq",
    "issues": [{ "path": "name", "message": "Enter a project name." }]
  }
}
```

The code is generated for each failure; it is not an error category, an HTTP status or a fixed value such as `INTERNAL_ERROR`. An explicit validation message supplied by a framework input check takes precedence over Zod's default formatting.

## Unexpected throws and intentional failures

Nile contains unexpected throws and rejected callbacks at its internal operation boundaries, including Slang nested-Result panics. Callers receive `Error Code: <generated-code> - could not complete the action`; the original exception text does not become the response message. Configured logging receives bounded cause diagnostics without SQL, error messages or payloads by default. Without a configured logger, Nile writes the bounded diagnostic to the console. Logger failures cannot replace the safe failure.

`raw` is reserved for internal diagnostics. Nile strips every `raw` property recursively from outgoing JSON objects and arrays, including explicit copies, `toJSON` output, custom JSON Responses, Socket.IO replies and topic messages. This happens at serialization, independently of exception handling, so successful actions cannot expose it either. It also means application response contracts must not use a public field named `raw`. JSON HTTP responses are buffered at this boundary to apply the filter; non-JSON assets keep their normal binary/stream behavior.

Intentional `Err(message)` values retain their messages. Keep them safe for callers; wrapping a sensitive driver error in `Err` deliberately exposes that text. Direct `safeTry` imports from `/fp` retain Slang's original behavior and are not automatic public-response sanitizers.

Execution admission and socket/queue capacity are released after failure. Unexpected startup failures reject initialization after cleanup with a sanitized error; explicit boot `Err` messages and framework timeout messages remain useful. This is a boundary around work Nile owns or awaits, not a process-wide uncaught-exception handler for unrelated timers or detached application promises.

`handleError({ message, data, atFunction })` logs through an explicit or configured logger and returns an `Err` formatted as `Error Code: <generated-code> - <your message>`. It fails fast if no logger is available. Use it when that traceable message is appropriate for the caller, and keep confidential details in logged data.

Result handling does not make a multi-step operation transactional or undo earlier side effects. Keep those decisions in the domain/data layer.

Next: [hooks and their failure rules](/guide/basics/hooks-and-pipelines).
