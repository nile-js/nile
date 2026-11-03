---
title: "Runtime adapters"
description: "Choose Bun native or the Hono adapter and connect your HTTP listener"
---

Your services, actions, validation and Result handling stay the same across Nile's two HTTP adapters. Choose the adapter for the environment and HTTP integrations your application needs.

| Application | Configuration | HTTP API |
|---|---|---|
| New Bun application | `runtime: "bun", native: true` | `server.nativeRest` |
| Existing Bun/Hono application | `runtime: "bun"`, omit `native` | `server.rest.app` |
| Node.js application | `runtime: "node"`, omit `native` | `server.rest.app` |

Hono is the default adapter. Bun native runs only with `native: true` and `runtime: "bun"`; `native: true` with any other runtime fails at setup.

## Bun native

```ts
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
if (!native) {
  throw new Error("Bun native transport was not initialized");
}
Bun.serve({ port: 8000, fetch: native.fetch });
```

## Hono on Bun or Node.js

Use the same server configuration with `native` omitted. For Bun, start the Hono handler with:

```ts
const app = server.rest?.app;
if (!app) {
  throw new Error("Hono transport was not initialized");
}
Bun.serve({ port: 8000, fetch: app.fetch });
```

For Node.js, select `runtime: "node"` when constructing the server, then start its Hono handler with the Node adapter:

```ts
import { serve } from "@hono/node-server";

const app = server.rest?.app;
if (!app) {
  throw new Error("Hono transport was not initialized");
}
serve({ port: 8000, fetch: app.fetch });
```

Creating the server and listening are separate steps on every adapter. Nile supports Bun and Node.js.

## Move an existing Hono application deliberately

Setting `native: true` changes the adapter, not your Hono-specific code. Replace Hono request access, routes, middleware and plugins with their native equivalents:

| Hono integration | Bun native equivalent |
|---|---|
| `server.rest.app.get(path, handler)` | `server.nativeRest.route("GET", path, handler)` |
| `server.rest.addMiddleware(path, handler)` | `server.nativeRest.addMiddleware(path, handler)` |
| Hono `c.req.raw` | Native `c.request` |
| Hono `c.req.param("id")` | Native `c.params.id` |
| `context.get("rest")` for Hono Context | `context.get<NativeRequestContext>("nativeRest")` |
| `context.getSession("rest")` | `context.getSession("rest")`, the same session key |

Native request contexts expose `json`, `text`, `respond`, outgoing `headers`, `setHeader`, request-local `get`/`set`, and cached `parseBody`. Standard Request and Response APIs handle headers, URLs and streams.

Global hooks, local hooks, JWT configuration, multipart actions, discovery, static files, status, rate limiting and startup stats use the same application model. Callback and custom-store types that depend on the HTTP adapter differ. Move Hono-context CORS callbacks to `rest.cors.actions` native policies. Boolean and plain-option action CORS settings work on both adapters.

Test authentication, authorization, custom routes, uploads and middleware before switching an existing deployment. See [custom routes](/guide/basics/custom-routes) and [deployment](/guide/start/deploy).
