---
title: "Testing actions"
description: "Test action rules with server.invoke and Bun's test runner, without starting an HTTP listener"
---

`server.invoke` runs an action through the same pipeline as HTTP: validation, hooks and the handler. A test can call it directly and check the Result, so you test the rules your callers depend on without starting a server or opening a port.

## When to use it

Test every validation rule, every `Err` path and every hook that changes behavior. Keep HTTP tests for routing, headers and content types, which only an HTTP request reaches.

## Complete example

This test file creates a server for the `notes` service and runs two cases with Bun's built-in test runner. Save it as a `.test.ts` file and run `bun test`.

```ts
import { describe, expect, test } from "bun:test";
import { createAction, createNileServer, createServices } from "@nilejs/nile";
import { Err, Ok } from "@nilejs/nile/fp";
import { z } from "zod";

const addNoteSchema = z.object({
  text: z.string().trim().min(1, "Text is required"),
});

type AddNoteInput = z.infer<typeof addNoteSchema>;

const addNoteHandler = (data: AddNoteInput) => {
  if (data.text.length > 280) {
    return Err("Note is too long");
  }
  return Ok({ note: { text: data.text } });
};

const addNoteAction = createAction({
  name: "add",
  description: "Add a note",
  validation: addNoteSchema,
  handler: addNoteHandler,
});

const services = createServices([
  {
    name: "notes",
    description: "Notes",
    actions: [addNoteAction],
  },
]);

const server = await createNileServer({
  serverName: "notes-test",
  services: services,
  rest: { baseUrl: "/api", allowedOrigins: ["http://localhost:3000"] },
});

describe("notes.add", () => {
  test("returns the saved note", async () => {
    const result = await server.invoke({
      service: "notes",
      action: "add",
      payload: { text: "Ship the release" },
    });

    expect(result.isOk).toBe(true);
    expect(result.value).toEqual({ note: { text: "Ship the release" } });
  });

  test("rejects an empty note before the handler runs", async () => {
    const result = await server.invoke({
      service: "notes",
      action: "add",
      payload: { text: "" },
    });

    expect(result.isErr).toBe(true);
    expect(result.error).toContain("Text is required");
  });
});
```

In the example project, running the file produced:

```text
 2 pass
 0 fail
 4 expect() calls
Ran 2 tests across 1 file.
```

## Testing a protected action

Protected actions need credentials. Pass the headers the verifier reads as `credentials`:

```ts
const result = await server.invoke({
  service: "account",
  action: "profile",
  payload: { includeOrganization: true },
  credentials: {
    headers: new Headers({ authorization: `Bearer ${token}` }),
  },
});
```

Without `credentials`, the call returns `Authentication required: no request context available`. Create the token with the same secret the test server uses, for example in a fixture file.

## Test isolation

- Calling `createNileServer` again returns the existing instance and logs a warning. Pass `forceNewInstance: true` when a file needs a second server with different settings.
- Pass the same `services` and `resources` objects the application uses so the test runs the real definitions.
- Give each file that writes data a fresh in-memory database, separate from the application's data directory.

## Options that matter

| Test concern | Set |
| --- | --- |
| Action input | `payload` in `server.invoke` |
| Identity | `credentials` for protected actions, or `session` for trusted application code |
| Cancellation | `signal` to test how a handler stops |
| Rate limits | An `execution.rateLimit` policy with a small `limit`, so the test reaches it quickly |

## Limits

- Routing, CORS, multipart parsing and response headers run only for HTTP requests. Test those through the HTTP app.
- A test that depends on time should inject its own clock or use short windows.
- Tests that write to a shared database can interfere with each other. Give each test file its own data.

## Common mistakes

- Asserting on `isOk` without checking the value for the success path.
- Testing only the success path. Test each `Err` the handler can return.
- Calling a protected action without credentials and expecting it to pass.
- Creating several servers in one file without `forceNewInstance`.

## See also

- [HTTP and direct calls](/guide/features/calling-actions) explains `server.invoke` options.
- [Errors and Results](/guide/basics/errors-and-results) explains the Result shapes you assert on.
- [Production operations](/guide/reference/operations) covers execution options your tests may need to set.
