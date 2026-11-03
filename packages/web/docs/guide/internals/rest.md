---
title: "REST"
description: "Configure the HTTP action endpoint, discovery and adapter behavior"
---

Nile exposes registered operations through `POST {baseUrl}/services`. The transport parses input, applies configured HTTP policies and sends an operation to the engine. The same action organization works with Bun native and the Hono adapter.

## Request and response

With `rest.baseUrl: "/api"`:

```http
POST /api/services
Content-Type: application/json
```

```json
{
  "intent": "execute",
  "service": "projects",
  "action": "create",
  "payload": { "name": "Customer portal" }
}
```

A successful execution uses an HTTP 200 envelope containing `status: true`, a message and action data. Action failures use a failed envelope and HTTP 400. A malformed request, disabled discovery, an upload violation, a missing route and an unexpected HTTP error each have their own status code, so read the body's `status` before treating a response as an action Result.

See [errors and Results](/guide/basics/errors-and-results) for the handler, HTTP and client boundaries.

## Intents

| Intent | Use |
| --- | --- |
| `execute` | Invoke a registered operation. |
| `explore` | Inspect visible services/actions when discovery is enabled. |
| `schema` | Retrieve supported input schemas as JSON Schema when enabled. |

Discovery is off by default; when you enable it, set a discovery secret. Schema conversions run on request and are cached, and action outputs are never cached. See [discovery and agents](/guide/basics/discovery-and-agents).

## Configure the endpoint

Settings remain under `rest` for both adapters:

| Setting | Purpose |
| --- | --- |
| `baseUrl` | Prefix for the action endpoint. |
| `allowedOrigins`, `cors` | Browser cross-origin policy. |
| `rateLimiting` | Configured request limit and client-key source. |
| `uploads` | Multipart validation and limits. |
| `enableStatic`, `staticDir` | Optional static serving under `/assets/*`. |
| `enableStatus` | Adds `GET /status` and `GET /ready`. |
| `discovery` | Explicit runtime metadata/schema access. |
| `diagnostics` | Diagnostic output for transport work. |

Rate limiting is enabled when a limiting header is configured. In-memory limits apply per process, so several instances need a shared store. Trust forwarded client headers only behind a proxy you control. CORS governs browsers only, so it never replaces authentication or authorization.

Multipart requests carry `intent`, `service` and `action` fields alongside their fields/files. See [uploads](/guide/basics/uploads) for actual payload shapes and limits.

## Native middleware and routes

After creating a Bun-native server:

```ts
const native = server.nativeRest;
if (!native) {
  throw new Error("Native transport was not initialized");
}

native.addMiddleware("/api", async (context, next) => {
  context.setHeader("X-Application", "back-office");
  await next();
});

native.route("GET", "/health", (context) => {
  return context.json({ ready: true });
});
```

Native middleware can return a Response to stop execution or await `next()` and modify response headers. Native request state uses `context.get/set`; request headers are read through `context.request.headers`.

## Hono compatibility

Existing applications keep `server.rest.app` for Hono routes and `server.rest.addMiddleware` for action middleware. Hono callbacks receive a Hono Context, so port them when you change adapters; `native: true` leaves Hono plugins unported.

See [custom routes](/guide/basics/custom-routes), [CORS](/guide/internals/cors) and [runtime adapters](/guide/start/runtime-adapters).

## Limit repeated requests

When an application needs a request quota, configure it alongside the transport rather than repeating a counter in each action. This server-config fragment applies a per-client limit:

```ts
rest: {
  baseUrl: "/api",
  allowedOrigins: ["https://app.example.com"],
  rateLimiting: {
    limitingHeader: "x-forwarded-for",
    windowMs: 60_000,
    limit: 120,
    standardHeaders: true,
  },
}
```

Use a header your proxy sets and overwrites, since a header the caller controls proves nothing. Requests without client information share one fallback key. Rate limiting works alongside authorization.

The default in-memory store belongs to one process. Several instances enforcing one combined quota need a shared store. Native stores implement Nile's native store contract; Hono stores use the Hono rate-limiter contract. See [runtime adapters](/guide/start/runtime-adapters) before moving an existing custom store between adapters. A store you supply manages its own connections and lifecycle.
