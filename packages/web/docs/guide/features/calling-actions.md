---
title: "HTTP, WebSocket and direct calls"
description: "Call one action from HTTP, a socket client or your own backend code, and know what each path requires"
---

Every action runs through the same pipeline no matter how it was called: validation, hooks, the handler and the JWT check for protected actions. The transport changes how you send the request and how the response arrives. This page shows the three paths and what each one needs.

## When to use each path

| Path | Use it for | Requires |
| --- | --- | --- |
| HTTP `POST /api/services` | Browsers, mobile apps, curl and any HTTP client | `intent`, `service`, `action` and `payload` in the body |
| Socket client `invoke` | Clients that already hold a socket connection for topics | An authenticated socket connection |
| `server.invoke` | Jobs, scheduled work and other code in the same backend | Credentials for protected actions |

## HTTP

Every operation is a `POST` to the services endpoint. The `intent` field selects `execute`, `explore` or `schema`:

```sh
curl -s -X POST http://localhost:8000/api/services \
  -H "Content-Type: application/json" \
  -d '{"intent":"execute","service":"tasks","action":"list","payload":{}}'
```

A successful call returns `status: true` with the handler's object as `data`:

```json
{
  "status": true,
  "message": "Action 'tasks.list' executed",
  "data": {
    "tasks": []
  }
}
```

A failed call returns `status: false` and HTTP 400. Read the `status` field as well as the HTTP status.

## Socket client

The dedicated socket client sends `invoke` over the same connection that receives topic messages. Use the same payload types as the HTTP client:

```ts
const changed = await socket.invoke({
  service: "orders",
  action: "set-status",
  payload: { orderId: orderId, status: "packed" },
});

if (changed.isErr) {
  console.error(changed.error, changed.details);
  return;
}

console.log(changed.value);
```

Protected actions use the identity that the server verified when the socket connected. See [sockets and typed messages](/guide/reference/realtime) for the connection setup.

## Direct calls with `server.invoke`

`server.invoke` runs an action in the same process without a network request. It is the right call from a scheduled job or from backend code that already has a server instance:

```ts
const result = await server.invoke({
  service: "orders",
  action: "create",
  payload: { customerId: customerId, total: 0 },
  requestId: "job-create-order-1",
});

if (result.isErr) {
  return Err(result.error);
}

return Ok(result.value);
```

The optional fields are:

| Field | Purpose |
| --- | --- |
| `requestId` | Correlates logs and telemetry for this call. |
| `signal` | Cancels the call. Nested calls inherit it. |
| `credentials` | Headers to verify for a protected action. Required when the action is protected. |
| `session` | Trusted application session for the call. It does not skip JWT verification. |
| `clientKey` | Identity used for rate limits. |

Calling a protected action without `credentials` returns `Err("Authentication required: no request context available")`. Pass the verified headers, as the socket transport does, or call an unprotected action instead.

An action with `visibility: { rpc: false }` cannot be called through `server.invoke`. Set `rpc.enabled: false` on the server to turn the direct interface off entirely.

## Limits

- Timeouts apply to HTTP and direct calls through `execution.timeoutMs`. A timed-out call stops waiting, but code that ignores its signal keeps running.
- Writes made before a timeout or a failure are not rolled back.
- The socket client has a finite acknowledgement timeout. A timeout does not prove that the write did not commit.

## Common mistakes

- Sending a multipart upload to a JSON action, or a JSON body to an upload action. See [file uploads](/guide/features/file-uploads).
- Calling `server.invoke` for a protected action without credentials.
- Passing a client-supplied `session` into `server.invoke` and expecting it to replace JWT verification.
- Reading `value` before checking `isErr` on the client.

## See also

- [Production operations](/guide/reference/operations) explains direct calls, cancellation and correlation IDs.
- [Sockets and typed messages](/guide/reference/realtime) describes the socket contract.
- [Testing actions](/guide/advanced/testing-actions) uses `server.invoke` in tests.
