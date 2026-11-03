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
  "message": "Action completed.",
  "data": { "project": { "id": "project-123", "name": "Customer portal" } }
}
```

An action failure has `status: false`, its error message and `data: {}`, or `{ errorCode, issues }` for invalid input. Every action failure, including an unknown action, returns HTTP 400, and so does a malformed request body. A missing HTTP route returns 404. Check `status` in the body as well as the HTTP status. See [errors and Results](/guide/basics/errors-and-results).

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

`explore` lists operation metadata and `schema` returns input schemas as JSON Schema. Both answer only when discovery is enabled. See [discovery and agent integrations](/guide/basics/discovery-and-agents) before exposing them.

For file input use [multipart uploads](/guide/basics/uploads). For webhooks or HTTP-specific semantics use [custom routes](/guide/basics/custom-routes).
