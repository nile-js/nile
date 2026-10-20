# Know where the next feature belongs

A small team should be able to open an unfamiliar feature and follow it. Use domains to give that work a home, services to list its public operations, and ordinary functions for the business rules behind them.

This is a recommended organization, not a folder scanner. Nile executes the services and actions you explicitly register; it does not assign behavior to directory names.

## Start with one domain

```text
src/
  index.ts
  config.ts
  services/
    services.config.ts
    projects/
      index.ts
      create-project.ts
      archive-project.ts
      types.ts
  business/
    projects/
      calculate-project-progress.ts
  db/
    client.ts
    models/
      projects.ts
  hooks/
    authorize-action.ts
  generated/
    schemas.ts
    types.ts
```

Keep the same domain names across the frontend operation, service, action and model. A teammate looking for project creation can follow `projects.create` to `create-project.ts`, then to the project model. A coding agent has the same explicit registration map and named modules to follow.

For a smaller project, keep the business functions and model inside the domain directory instead. Pick one convention and apply it consistently. The CLI template uses `src/services/services.config.ts` as its registry.

## Give each layer one job

| Place | Responsibility |
|---|---|
| Action | Describe the operation, validate input, check identity or policy, coordinate the business call and return a Result. |
| Ordinary business function | Calculate or enforce a domain rule that can be reused without an HTTP request. |
| Model or repository | Own the application's data access and return useful success or failure information. |
| Service registry | Show which named operations the application exposes. |
| Shared context | Supply long-lived resources such as a logger or database client. |
| Hook | Apply a common policy or transformation at a defined pipeline point. |

An action does not need a model if it has no persistence. A helper does not need to become an action merely to be reused. For example, both `tickets.complete` and `collaboration.confirm` can call an ordinary scoring function.

## Register the domain explicitly

```typescript
// services/projects/index.ts
import { createService } from "@nilejs/nile";
import { createProject } from "./create-project";
import { archiveProject } from "./archive-project";

export const projectsService = createService({
  name: "projects",
  description: "Create and manage team projects",
  actions: [createProject, archiveProject],
});
```

```typescript
// services/services.config.ts
import { createServices } from "@nilejs/nile";
import { projectsService } from "./projects";

export const services = createServices([projectsService]);
```

Service names must be unique, and action names must be unique within their service. Nile rejects duplicate registration at startup.

## Follow a change through the application

To add project archiving:

1. Find the `projects` service and read a neighboring action.
2. Define the archive input schema beside `archive-project.ts`.
3. Check the caller's access before changing project state.
4. Put data access in the project model and reusable domain rules in ordinary functions.
5. Return an explicit Result for success and expected failures.
6. Register the action, then call `projects.archive` from the client.

Keep database selection, migrations and transactions in your application. Nile offers optional [Drizzle model helpers](/guide/internals/db/), but does not require them or manage your schema lifecycle.

## Grow the application without changing the mental model

The maintainer's fintech backend has over 500 actions and continues to grow. The in-house Back Office tool was shipped in days; the reviewed version had 15 services and 78 actions. These are examples of a small team applying the same organization repeatedly, not guarantees about delivery time or request capacity.

The useful constraint is consistency: once someone understands one operation, the next operation has a familiar place to start.

Next: [share dependencies through context](/guide/basics/context), [handle failures consistently](/guide/basics/errors-and-results), and [reuse access policies](/guide/basics/auth).
