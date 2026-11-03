---
title: "From REST to Nile"
description: "Map well known HTTP operations to services and named actions"
---

A growing product adds operations such as approving a submission, archiving a project or refunding a payment. Nile names those operations directly: `projects.archive`, `submissions.approve`, `payments.refund`.

You still design each operation, its input and its access policy. Nile gives every operation the same call shape instead of its own route.

## One interface, named operations

```json
{
  "intent": "execute",
  "service": "projects",
  "action": "archive",
  "payload": { "projectId": "project-123" }
}
```

Send this to `POST /api/services` when `rest.baseUrl` is `/api`.

| Well known HTTP concept | Nile application concept |
|---|---|
| A domain route group | A service such as `projects` |
| An operation handler | A named action such as `archive` |
| Path, query or body input | Action payload checked with a Zod schema |
| A common access policy | A global or action hook |
| A frontend request helper | `client.invoke({ service, action, payload })` |

Domain rules live in each service's `modules/`, and data access stays in your chosen models. See [application structure](/guide/start/application-structure).

## What one call shape gives a team

Every operation keeps validation, policy and result handling in the same places. A new teammate reads one action and finds the same layout in the next. The frontend calls the operation by name, and the service registry lists everything the application exposes.

Nile builds its action lookup once at startup, so a call finds its action without scanning the list. Throughput still depends on your handlers and adapter; see the [measured workload](/guide/reference/performance).

## Keep HTTP where it is useful

Webhooks, authentication callbacks and streaming responses can use [custom routes](/guide/basics/custom-routes). Choose native or Hono APIs for the selected adapter.

The shared POST endpoint has trade-offs:

- HTTP GET caching does not apply to actions.
- REST gateways, per-route analytics and OpenAPI tooling expect one route per operation and may need changes.
- `explore` and `schema` describe registered operations when [discovery is enabled](/guide/basics/discovery-and-agents). They return JSON Schema, not an OpenAPI document, and do not replace your application documentation.

Move an existing application [one domain at a time](/guide/start/migration).
