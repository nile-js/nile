# Migrate one domain at a time

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

```typescript
import { createAction } from "@nilejs/nile";
import { z } from "zod";
import { archiveProject } from "../../business/projects/archive-project";

const inputSchema = z.object({ projectId: z.string().min(1) });
type ArchiveInput = z.infer<typeof inputSchema>;

export const archiveProjectAction = createAction<ArchiveInput>({
  name: "archive",
  description: "Archive a project",
  validation: inputSchema,
  handler: (input) => archiveProject(input),
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
