# From routes to business operations

A growing product adds operations such as approving a submission, archiving a project or refunding a payment. Nile names those operations directly: `projects.archive`, `submissions.approve`, `payments.refund`.

The goal is a consistent place for the team to work. You still design the operation, its input and its access policy. Nile gives it a common invocation shape rather than another per-operation route.

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

| Familiar HTTP concept | Nile application concept |
|---|---|
| A domain route group | A service such as `projects` |
| An operation handler | A named action such as `archive` |
| Path, query or body input | Action payload checked with a Zod schema |
| A common access policy | A global or action hook |
| A frontend request helper | `client.invoke({ service, action, payload })` |

Business logic can stay in ordinary functions and data access can stay in your chosen models. See [application structure](/guide/start/application-structure).

## What the constraint buys a small team

Every operation has the same places to look for validation, policy and result handling. A new teammate can follow one action and use that pattern again. The frontend calls the business operation by name, while the registry provides a map of the application's capabilities.

Nile precomputes action lookups at startup. That avoids scanning the action list on each call; it does not by itself guarantee higher HTTP throughput than another router. See the [measured workload](/guide/reference/performance).

## Keep HTTP where it is useful

Webhooks, authentication callbacks and streaming responses can use [custom routes](/guide/basics/custom-routes). Choose native or Hono APIs for the selected adapter.

The shared POST endpoint has trade-offs. Standard GET caching does not automatically apply to actions. Existing REST gateways, per-route analytics and generated OpenAPI integrations may need adaptation. Runtime `explore` and `schema` can describe registered operations when [discovery is enabled](/guide/basics/discovery-and-agents); they are not an OpenAPI server or a complete replacement for application documentation.

Move an existing application [one domain at a time](/guide/start/migration).
