---
title: "Services"
description: "Group related actions into an explicitly registered domain"
---

Group related operations in a service named for their domain, such as projects, billing or membership. Register its public actions in the domain’s `index.ts`.

```ts
import { createService, createServices } from "@nilejs/nile";
import { createProject } from "./projects/create-project";
import { archiveProject } from "./projects/archive-project";

const projectsService = createService({
  name: "projects",
  description: "Create and manage team projects",
  actions: [createProject, archiveProject],
});

export const services = createServices([projectsService]);
```

Pass `services` to `createNileServer`. Nile registers that list at startup and rejects duplicate service names or duplicate action names within a service.

A service groups actions inside one application and one process. Its domain functions and models can be imported by other services or shared through context resources.

## Keep registration useful

Put the registry in a predictable file, such as `services/services.config.ts`. Give each action a description of what it changes. Keep large implementations in their own domain modules so the registry remains easy to scan.

Nile logs service/action totals and per-service registration timings at startup by default. Inspect the same snapshot without printing:

```ts
console.log(server.stats());
```

The snapshot contains `totalServices`, `totalActions`, `registrationDurationMs`, `startupDurationMs` and a `services` array with each service's `actionCount` and `registrationDurationMs`. The timings start once your modules are loaded, so they leave out import time and database setup. Set `logServices: false` to hide the startup table.

See [application structure](/guide/start/application-structure) for a domain layout that gives new teammates a well known path through the code.
