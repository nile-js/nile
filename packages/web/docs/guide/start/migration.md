---
title: "Migration guide"
description: "Introduce services and actions alongside an existing application"
---

Start with an operation your team understands. Keep its business logic and data layer, give it a Nile action boundary, and verify its existing behavior before moving more traffic.

## Map the operation

| Existing API | Nile operation |
|---|---|
| `POST /projects` | `projects.create` |
| `GET /projects/:id` | `projects.get` with `{ projectId }` |
| `POST /projects/:id/archive` | `projects.archive` with `{ projectId }` |

The client must switch to `POST /api/services` with the service/action envelope. Simply forwarding an old path to Nile does not translate its parameters or request body. If existing clients must keep their URLs, write an explicit compatibility route or retain the old handler during migration.

## Keep the business function

This action adapts an existing application function that already returns a Result:

```ts
import { createAction } from "@nilejs/nile";
import { z } from "zod";
import { archiveProject } from "../../business/projects/archive-project";

const archiveProjectSchema = z.object({
  projectId: z.string().min(1),
});

type ArchiveProjectInput = z.infer<typeof archiveProjectSchema>;

const archiveProjectHandler = (input: ArchiveProjectInput) => {
  return archiveProject(input);
};

export const archiveProjectAction = createAction<ArchiveProjectInput>({
  name: "archive",
  description: "Archive a project",
  validation: archiveProjectSchema,
  handler: archiveProjectHandler,
});
```

Register it under the projects service. Preserve the original authorization rules; the short example above does not add an access policy.

## Make failure paths explicit

Map ordinary business failures to `Err(message)` and success to `Ok(data)`. Wrap potentially failing external operations in `safeTry` and decide which message is safe to return. Nile action failures normally map to HTTP 400, including an action-level not-found error; they do not preserve arbitrary status codes from the previous API.

Keep HTTP-specific status behavior in a custom route when consumers depend on it. See [errors and Results](/guide/basics/errors-and-results).

## Reuse policies without losing them

Configure `auth` plus `isProtected` for built-in JWT verification, or enforce your chosen session provider in a global before hook. Implement role and organization checks explicitly. Hooks execute before input validation, so they must not assume the payload has already been validated.

See [authentication and access control](/guide/basics/auth) and [hook ordering](/guide/basics/hooks-and-pipelines).

## Verify, then move the next operation

Compare success, invalid input, missing identity, denied access and downstream failure against the existing behavior. Update the frontend call and its error handling. Move traffic only after those contracts are understood; keep a rollback path during the transition.

You can retain existing models, queries and integrations. Database migrations and transactional behavior remain application responsibilities. See [runtime adapters](/guide/start/runtime-adapters) before replacing Hono-specific integrations.


## Slang 0.2.2 and database failures

Nile now re-exports Slang 0.2.2 through `@nilejs/nile/fp`, including `list`, `struct`, `sets`, `memoized`, `taskGroup`, `createStepper`, `createSignal` and `createChannel`. Import from that entry point to share Nile's Result implementation.

The `dbTry` and `DbTryOptions` exports were removed. Replace `utils.dbTry(operation)` with `safeTry(operation)` from `@nilejs/nile/fp`. Caught errors preserve their original cause on non-enumerable `result.raw`. Use `utils.describeError(result.raw)` for bounded internal diagnostics and `utils.handleError` for an explicit safe caller message. `safeTry` does not sanitize `result.error`; do not expose raw driver failures. See [safe database failures](/guide/reference/shared-utilities#safe-database-failures).

Return existing Results directly. `Ok(Ok(value))` and `Ok(Err(message))` are rejected by Slang at type-check time and panic at runtime; use `Ok(value)` or `Err(message)` instead. This also applies to action and hook handlers.


## Exception boundaries

Unexpected throws from handlers, hooks and managed callbacks now return `Error Code: <generated-code> - could not complete the action` rather than exposing exception messages. Expected `Err(message)` responses retain their messages. Invalid nested Results remain invalid Slang usage, but Nile contains the panic at its managed callback boundaries so callers settle and execution capacity is released. Startup still fails after cleanup when boot cannot complete.

The property name `raw` is now reserved for internal diagnostics and is stripped recursively from outbound JSON across both HTTP adapters and Socket.IO. Rename public domain fields named `raw`. Custom JSON Responses are filtered as well; byte-count and content-validator headers are removed when rewriting the representation. Internal Results and direct backend calls retain diagnostic causes.


## Message formatting

The HTTP response envelope remains exactly `status`, `message` and `data`. The default success message is now `Action completed.`; action `successMessage` and messages returned with `Ok` retain their wording. Validation failures use Zod's `prettifyError` (or an explicitly provided message), with a generated unique `data.errorCode` and the existing `data.issues`. Diagnostic failures use `Error Code: <generated-code> - <message>` instead of bracketed identifiers. `handleError` and the internal exception boundary record the same generated code as `log_id`; these references are never fixed category names or numeric HTTP codes. Intentional `Err` messages remain unchanged.
