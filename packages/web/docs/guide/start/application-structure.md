---
title: "Application structure"
description: "Give each service, action and business rule a predictable place as your team grows"
---

A small team should be able to open an unfamiliar feature and follow it. Use domains to give that work a home, services to list its public operations, and ordinary functions for the business rules behind them.

Register services and actions explicitly. At startup, Nile checks the source structure once and reports misplaced or oversized action files, helping the team keep the same conventions as the application grows.

## Start with one domain

```text
src/
  index.ts
  config.ts
  services/
    services.config.ts
    projects/
      index.ts
      actions/
        create-project.ts
        archive-project/
          archive-project.ts
          index.ts
          modules/
            check-archive-policy.ts
      modules/
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

Keep the same domain names across the frontend operation, service, action and model. A teammate looking for project creation can follow `projects.create` to `actions/create-project.ts`, then to the project model. A coding agent has the same explicit registration map and named modules to follow.

For a smaller project, keep the business functions and model inside the domain directory instead. Pick one convention and apply it consistently. The CLI template uses `src/services/services.config.ts` as its registry.

## Grow an action into a folder

Start a small operation at `service/actions/create-project.ts`. When it needs several private helpers, use `service/actions/create-project/create-project.ts`, export it from `index.ts` and keep its helpers under `modules/`. Code shared by several actions belongs in the service's `modules/` directory.

```sh
bunx @nilejs/cli generate action projects archive --folder
```

Configure `project: { root: ".", structure: "error" }` on the server to fail startup when the structure check finds an error. Existing applications default to `"warn"`; `false` disables checking. In a monorepo, set `root` to the backend package. Source-less bundles skip the check unless a root is explicit. Action entry points above 400 lines receive refactoring guidance.

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

```ts
// services/projects/index.ts
import { createService } from "@nilejs/nile";
import { createProject } from "./actions/create-project";
import { archiveProject } from "./actions/archive-project";

export const projectsService = createService({
  name: "projects",
  description: "Create and manage team projects",
  actions: [createProject, archiveProject],
});
```

```ts
// services/services.config.ts
import { createServices } from "@nilejs/nile";
import { projectsService } from "./projects";

export const services = createServices([projectsService]);
```

Service names must be unique, and action names must be unique within their service. Nile rejects duplicate registration at startup.

## Follow a change through the application

To add project archiving:

1. Find the `projects` service and read a neighboring action.
2. Define the archive input schema beside `actions/archive-project/archive-project.ts`.
3. Check the caller's access before changing project state.
4. Put data access in the project model and reusable domain rules in ordinary functions.
5. Return an explicit Result for success and expected failures.
6. Register the action, then call `projects.archive` from the client.

Keep database selection, migrations and transactions in your application. Nile offers optional [Drizzle model helpers](/guide/internals/db/), but does not require them or manage your schema lifecycle.

## Grow the application without changing the mental model

The maintainer's fintech backend has over 500 actions and continues to grow. The in-house Back Office tool was shipped in days; the reviewed version had 15 services and 78 actions. These are examples of a small team applying the same organization repeatedly, not guarantees about delivery time or request capacity.

The useful constraint is consistency: once someone understands one operation, the next operation has a well known place to start.

Next: [share dependencies through context](/guide/basics/context), [handle failures consistently](/guide/basics/errors-and-results), and [reuse access policies](/guide/basics/auth).
