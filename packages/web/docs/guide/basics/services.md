---
title: "Services"
description: "Group related actions into an explicitly registered business domain"
---

A service gives related actions a recognizable home. Use domain names the team already uses: projects, tickets, billing or collaboration. As more operations arrive, people can start with the domain rather than search an unfamiliar route map.

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

A service is an application grouping, not a separately deployed microservice. It does not create a database, process or network boundary. Your ordinary business functions and models can be shared through explicit imports or application resources.

## Keep registration useful

Put the registry in a predictable file, such as `services/services.config.ts`. Give actions descriptions that explain the business effect. Keep large implementations in their own domain modules so the registry remains easy to scan.

Nile logs service/action totals and per-service registration timings at startup by default. Inspect the same snapshot without printing:

```ts
console.log(server.stats());
```

The snapshot contains `totalServices`, `totalActions`, `registrationDurationMs`, `startupDurationMs` and a `services` array with each service's `actionCount` and `registrationDurationMs`. It measures registration after modules have been constructed, not module import time or database loading per service. Set `logServices: false` to suppress the startup table.

See [application structure](/guide/start/application-structure) for a domain layout that gives new teammates a familiar path through the code.
