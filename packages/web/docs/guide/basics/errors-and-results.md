---
title: "Errors and Results"
description: "Return expected failures and guard operations with Slang Results"
---

Return `Ok(data)` when an action succeeds and `Err(message)` for an expected failure. Import Result helpers from `@nilejs/nile/fp` so your application and Nile use the same types.

```ts
import { createAction } from "@nilejs/nile";
import { Err, Ok } from "@nilejs/nile/fp";
import { z } from "zod";

const createProjectSchema = z.object({
  name: z.string().trim().min(1),
});

type CreateProjectInput = z.infer<typeof createProjectSchema>;

const createProjectHandler = (data: CreateProjectInput) => {
  if (data.name.toLowerCase() === "system") {
    return Err("Choose a different project name");
  }

  const project = {
    id: crypto.randomUUID(),
    name: data.name,
  };

  return Ok({ project: project });
};

export const createProject = createAction({
  name: "create",
  description: "Create a project",
  validation: createProjectSchema,
  handler: createProjectHandler,
});
```

The schema checks the input shape before the handler runs. The `if` enforces a rule of your application. Saving the project belongs in your model.

## Handle an operation that can fail

Wrap a call that can reject or throw in `safeTry`. Check the Result, log what you need internally, and return a message the caller can act on.

```ts
import { Err, Ok, safeTry } from "@nilejs/nile/fp";

const saved = await safeTry(() => saveProject(data));
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

export const archiveProject = createAction({
  name: "archive",
  description: "Archive a project",
  successMessage: "Project archived",
  validation: archiveProjectSchema,
  handler: (data: ArchiveProjectInput) => {
    if (data.notifyTeam) {
      return Ok({ id: data.id }, "Project archived and the team notified");
    }
    return Ok({ id: data.id });
  },
});
```

Import `Ok` from `@nilejs/nile/fp` to get the message argument. The [frontend client](/guide/basics/client) exposes the message as `result.message`.

## The three Result shapes

| Where | Successful value | Failure |
|---|---|---|
| Handler | `Ok({ project })`, inspect with `isOk` / `value` | `Err(message)`, inspect with `isErr` / `error` |
| HTTP | `{ status: true, message, data }` | `{ status: false, message, data: {} }` for engine failures |
| Frontend client | `{ isOk: true, isErr: false, value, error: null }` | `{ isOk: false, isErr: true, value: null, error: message, details }`; `details` holds any data the server attached |

An object returned by a handler becomes HTTP `data` as is. A primitive, array or null is wrapped as `{ result: value }`, so return an object such as `{ project }` to keep the frontend shape clear.

Every action failure returns HTTP **400**: an unknown action, failed authentication, a failing hook, invalid input or an `Err` from the handler. Unknown HTTP routes return 404, and disabled or denied discovery returns 403. Custom routes set their own status.

## Validation failures

HTTP responses contain exactly `status`, `message` and `data`. For a validation failure, `status` is false, `data.errorCode` holds a generated reference, and the message comes from Zod's `prettifyError`, keeping your custom schema messages. `data.issues` lists each failed field for frontend forms.

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

The code is new for each failure. Use it to find the matching log entry; it is not an error category or an HTTP status. A message set on a framework input check replaces Zod's default formatting.

## Unexpected throws and intentional failures

Nile catches unexpected throws and rejected promises in handlers, hooks and its own callbacks, including Slang nested-Result panics. The caller receives `Error Code: <generated-code> - could not complete the action`, and the exception text stays out of the response. Your logger receives a short summary of the cause, without SQL, error messages or payloads. Without a logger, Nile writes the summary to the console. If the logger itself fails, the caller still gets the same safe error.

`raw` is reserved for internal diagnostics. Nile strips every `raw` property recursively from outgoing JSON objects and arrays, including explicit copies, `toJSON` output, custom JSON Responses and topic messages. The filter runs on every response, successful ones included, so do not name a public field `raw`. JSON HTTP responses are buffered to apply the filter; other responses stream as usual.

An `Err(message)` you return reaches the caller word for word, so keep it safe: wrapping a database driver error in `Err` sends its text to the caller. `safeTry` keeps the caught error text in `result.error`, so translate it before you return it.

A failed call frees its execution slot and any queue or socket capacity it held. An unexpected startup failure cleans up, then rejects `createNileServer` with a safe error; an `Err` from `onBoot` and timeout messages keep their text. Nile catches failures only in work it runs or awaits. A throw from your own timer or a promise nobody awaits reaches the process as usual.

`handleError({ message, data, atFunction })` logs through an explicit or configured logger and returns an `Err` formatted as `Error Code: <generated-code> - <your message>`. It throws when no logger is available. Use it when the caller should get a traceable message, and keep confidential details in the logged data.

Returning `Err` undoes nothing already done. Put transactions for multi-step writes in your domain or data layer.

Next: [hooks and their failure rules](/guide/basics/hooks-and-pipelines).
