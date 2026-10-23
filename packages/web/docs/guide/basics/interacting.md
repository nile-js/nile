---
title: "HTTP interaction"
description: "Send an action request and handle its HTTP response"
---

All action calls use `POST {baseUrl}/services`. With `rest.baseUrl: "/api"`, send:

```sh
curl http://localhost:8000/api/services \
  -H 'Content-Type: application/json' \
  -d '{"intent":"execute","service":"projects","action":"create","payload":{"name":"Customer portal"}}'
```

| Field | Purpose |
|---|---|
| `intent` | `execute`, `explore` or `schema`. |
| `service` | Registered domain name. |
| `action` | Registered operation name. |
| `payload` | Operation input object. |

Execution requires a specific service and action; wildcards are for discovery. Nile checks the envelope, runs the action pipeline and maps its Result to the HTTP response.

```json
{
  "status": true,
  "message": "Action 'projects.create' executed",
  "data": { "project": { "id": "project-123", "name": "Customer portal" } }
}
```

An action failure has `status: false`, its error message and `data: {}`. Engine failures, including a missing action, normally return HTTP 400. Invalid request envelopes also return 400; a missing HTTP route returns 404. Check the envelope as well as the HTTP response. See [errors and Results](/guide/basics/errors-and-results).

## Use the client for application calls

```ts
const result = await nile.invoke({
  service: "projects",
  action: "create",
  payload: { name: "Customer portal" },
});

if (result.isErr) {
  console.error(result.error);
  return;
}

console.log(result.value);
```

The [frontend client](/guide/basics/client) maps the envelope to a Result: `isErr` is true for a failed envelope, and `value` holds the action's data on success.

`explore` lists operation metadata and `schema` converts supported input schemas to JSON Schema. Both are disabled unless discovery is configured. See [discovery and agent integrations](/guide/basics/discovery-and-agents) before exposing them.

For file input use [multipart uploads](/guide/basics/uploads). For webhooks or HTTP-specific semantics use [custom routes](/guide/basics/custom-routes).
