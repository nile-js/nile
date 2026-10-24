---
title: "Validation and errors"
description: "Validate action input with Zod and return expected failures as Results that clients can read"
---

Validation rejects a bad payload before your handler runs. A handler returns `Err` when a business rule refuses the request. Both reach the caller as a failure, so the client checks one thing: `isErr`.

## When to use it

Declare a Zod schema in `validation` on every action that accepts input. Use `Err` in the handler for rules that need data the schema cannot see, such as a name that is already taken or a record that belongs to another organization.

## Complete example

This action validates a project and then applies a reserved-name rule in its handler. The nested `address.city` field shows how a dotted field path appears in the response.

```ts
import { createAction, createServices } from "@nilejs/nile";
import { Err, Ok } from "@nilejs/nile/fp";
import { z } from "zod";

const createProjectSchema = z.object({
  name: z.string().trim().min(3, "Name must have at least 3 characters"),
  address: z.object({
    city: z.string().min(1, "City is required"),
  }),
  budget: z.number().int().nonnegative("Budget cannot be negative"),
});

type CreateProjectInput = z.infer<typeof createProjectSchema>;

const reservedNames: readonly string[] = ["system", "admin"];

const createProjectHandler = (input: CreateProjectInput) => {
  if (reservedNames.includes(input.name.toLowerCase())) {
    return Err("Choose a different project name");
  }

  return Ok({
    project: {
      name: input.name,
      city: input.address.city,
      budget: input.budget,
    },
  });
};

const createProjectAction = createAction<CreateProjectInput>({
  name: "create",
  description: "Create a project after validating its input",
  validation: createProjectSchema,
  handler: createProjectHandler,
});

export const services = createServices([
  {
    name: "projects",
    description: "Project operations",
    actions: [createProjectAction],
  },
]);
```

Send a payload with an empty name and an empty city:

```sh
curl -s -X POST http://localhost:8000/api/services \
  -H "Content-Type: application/json" \
  -d '{"intent":"execute","service":"projects","action":"create","payload":{"name":"Hi","address":{"city":""},"budget":10}}'
```

The response carries the field path in `data.issues`:

```json
{
  "status": false,
  "message": "Validation failed: ✖ Name must have at least 3 characters\n  → at name\n✖ City is required\n  → at address.city",
  "data": {
    "issues": [
      { "path": "name", "message": "Name must have at least 3 characters" },
      { "path": "address.city", "message": "City is required" }
    ]
  }
}
```

A rejected name returns a failure from the handler instead:

```json
{
  "status": false,
  "message": "Choose a different project name",
  "data": {}
}
```

## Read failures in the client

The frontend client returns the same Result pattern as the handler. On failure, `error` is the message and `details` holds the `data` object the server sent, including `issues` for validation failures.

```ts
const created = await nile.invoke({
  service: "projects",
  action: "create",
  payload: { name: name, address: { city: city }, budget: budget },
});

if (created.isErr) {
  console.error(created.error);
  console.error(created.details);
  return;
}

console.log(created.value);
```

Here `nile` is a client created with `createNileClient`, as in [the frontend client guide](/guide/basics/client). Read `value` only after the `isErr` check.

## Options that matter

| Where | Option | Effect |
| --- | --- | --- |
| Action | `validation` | Zod schema for the payload. Use `null` or omit it for actions without input. |
| Action | `handler` | Named function that returns `Ok(value)` or `Err(message)`. |
| Schema | `z.infer<typeof schema>` | Input type for the handler. Use it as the generic argument to `createAction`. |

## How it behaves

- The order is: JWT check, global before hook, local before hooks, Zod validation, handler, local after hooks, global after hook. Before hooks see the raw payload, so validate again in them if you depend on a field.
- Zod object schemas remove keys they do not declare. The handler receives only the parsed fields.
- A validation failure returns HTTP 400 with `status: false`. Handler `Err` values also return HTTP 400.
- `data.issues` appears only for validation failures. Other failures return `data: {}`.
- A handler that throws is caught and returned as a failure with the thrown message. Return `Err` for expected cases so the message is one you chose.

## Common mistakes

- Returning a plain string or throwing for an expected rule. Return `Err("...")` so the client gets a Result.
- Reading `result.value` before checking `result.isErr`.
- Putting a business rule only in the client. The server must enforce it.
- Showing `error` text from a validation failure to an end user without reading `details.issues`. The issues tell a form which field to highlight.

## See also

- [Errors and Results](/guide/basics/errors-and-results) explains the three response shapes.
- [Actions](/guide/basics/actions) covers action definition and naming.
- [Hooks and pipelines](/guide/basics/hooks-and-pipelines) explains when before hooks see unvalidated input.
- [Frontend client](/guide/basics/client) covers request options and the client Result.
