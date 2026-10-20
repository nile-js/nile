# HTTP transport

Nile exposes registered business operations through `POST {baseUrl}/services`. The transport parses input, applies configured HTTP policies and sends an operation to the engine. The same action organization works with Bun native and the Hono adapter.

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

A successful execution uses an HTTP 200 envelope containing `status: true`, a message and action data. Action failures use a failed envelope and HTTP 400. Invalid transport input, disabled discovery, upload violations, missing routes and unexpected HTTP errors have their own status codes. Do not treat every non-200 response as a business Result.

See [errors and Results](/guide/basics/errors-and-results) for the handler, HTTP and client boundaries.

## Intents

| Intent | Use |
| --- | --- |
| `execute` | Invoke a registered operation. |
| `explore` | Inspect visible services/actions when discovery is enabled. |
| `schema` | Retrieve supported input schemas as JSON Schema when enabled. |

Discovery is disabled by default. Enable it deliberately and consider a discovery secret. Schema conversions are lazy and cached; action outputs are not cached. See [discovery and agents](/guide/basics/discovery-and-agents).

## Configure the boundary

Settings remain under `rest` for both adapters:

| Setting | Purpose |
| --- | --- |
| `baseUrl` | Prefix for the action endpoint. |
| `allowedOrigins`, `cors` | Browser cross-origin policy. |
| `rateLimiting` | Configured request limit and client-key source. |
| `uploads` | Multipart validation and limits. |
| `enableStatic`, `staticDir` | Optional static serving under `/assets/*`. |
| `enableStatus` | Optional `GET /status` health response. |
| `discovery` | Explicit runtime metadata/schema access. |
| `diagnostics` | Diagnostic output for transport work. |

Rate limiting is enabled when a limiting header is configured. In-memory limits are local to a process; choose a suitable shared store for multiple instances. Trust forwarded client headers only behind infrastructure that controls them. CORS is browser policy, not authentication or authorization.

Multipart requests carry `intent`, `service` and `action` fields alongside their fields/files. See [uploads](/guide/basics/uploads) for actual payload shapes and limits.

## Native middleware and routes

After creating a Bun-native server:

```typescript
const native = server.nativeRest;
if (!native) throw new Error("Native transport was not initialized");

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

Existing applications keep `server.rest.app` for Hono routes and `server.rest.addMiddleware` for action middleware. Hono callbacks receive a Hono Context, not a native context. Migrate those callbacks when changing adapters; setting `native: true` does not translate Hono plugins.

See [custom routes](/guide/basics/custom-routes), [CORS](/guide/internals/cors) and [runtime adapters](/guide/start/runtime-adapters).

## Put a bound on repeated requests

When an application needs a request quota, configure it alongside the transport rather than repeating a counter in each action. This server-config fragment applies a per-client limit:

```typescript
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

Use a header supplied and overwritten by a trusted proxy; an arbitrary caller-controlled header is not a verified identity. Missing client information can make requests share a fallback key. Rate limiting complements authorization rather than replacing it.

The default in-memory store belongs to one process. Multiple instances need a deliberately chosen shared-store policy if they must enforce one combined quota. Native stores implement Nile's native store contract; Hono stores use the Hono rate-limiter contract. See [runtime adapters](/guide/start/runtime-adapters) before moving an existing custom store between adapters. Application-owned stores remain responsible for external connections and lifecycle.
