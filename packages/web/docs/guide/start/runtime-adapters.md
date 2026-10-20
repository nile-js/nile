# Choose a runtime adapter

Your services, actions, validation and Result handling stay the same across Nile's two HTTP adapters. Choose the adapter for the environment and HTTP integrations your application needs.

| Application | Configuration | HTTP API |
|---|---|---|
| New Bun application | `runtime: "bun", native: true` | `server.nativeRest` |
| Existing Bun/Hono application | `runtime: "bun"`, omit `native` | `server.rest.app` |
| Node.js application | `runtime: "node"`, omit `native` | `server.rest.app` |

Hono remains the default compatibility path. Updating Nile does not opt an existing application into Bun native. Native requires an explicit Bun runtime; a conflicting configuration fails at setup.

## Bun native

```typescript
import { createNileServer } from "@nilejs/nile";
import { services } from "./services/services.config";

const server = await createNileServer({
  serverName: "Team workspace",
  services,
  runtime: "bun",
  native: true,
  rest: { baseUrl: "/api", allowedOrigins: ["http://localhost:3000"] },
});

const native = server.nativeRest;
if (!native) throw new Error("Bun native transport was not initialized");
Bun.serve({ port: 8000, fetch: native.fetch });
```

## Hono on Bun or Node.js

Use the same server configuration with `native` omitted. For Bun, start the Hono handler with:

```typescript
const app = server.rest?.app;
if (!app) throw new Error("Hono transport was not initialized");
Bun.serve({ port: 8000, fetch: app.fetch });
```

For Node.js, select `runtime: "node"` when constructing the server, then start its Hono handler with the Node adapter:

```typescript
import { serve } from "@hono/node-server";

const app = server.rest?.app;
if (!app) throw new Error("Hono transport was not initialized");
serve({ port: 8000, fetch: app.fetch });
```

Construction and listening are separate in every case. Runtime support here is Bun and Node.js; do not assume other Hono deployment targets are supported by Nile.

## Move an existing Hono application deliberately

Changing `native` is only one part of migration. Replace Hono-specific request access, routes, middleware and plugins with native equivalents.

| Hono integration | Bun native equivalent |
|---|---|
| `server.rest.app.get(path, handler)` | `server.nativeRest.route("GET", path, handler)` |
| `server.rest.addMiddleware(path, handler)` | `server.nativeRest.addMiddleware(path, handler)` |
| Hono `c.req.raw` | Native `c.request` |
| Hono `c.req.param("id")` | Native `c.params.id` |
| `context.get("rest")` for Hono Context | `context.get<NativeRequestContext>("nativeRest")` |
| `context.getSession("rest")` | Unchanged authenticated-session key |

Native request contexts expose `json`, `text`, `respond`, outgoing `headers`, `setHeader`, request-local `get`/`set`, and cached `parseBody`. Standard Request and Response APIs handle headers, URLs and streams.

Global hooks, local hooks, JWT configuration, multipart actions, discovery, static files, status, rate limiting and startup stats use the same application model. Callback and custom-store types that depend on the HTTP adapter differ. Migrate Hono-context CORS callbacks to `rest.cors.actions` native policies; static boolean and plain-option action CORS settings can remain.

Test authentication, authorization, custom routes, uploads and middleware before switching an existing deployment. See [custom routes](/guide/basics/custom-routes) and [deployment](/guide/start/deploy).
