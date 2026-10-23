---
title: "Custom routes"
description: "Add HTTP routes for webhooks, downloads and streaming responses"
---

Use actions for business operations, and ordinary HTTP routes when an integration expects a particular URL, method or response. Webhooks, authentication callbacks and streaming endpoints can live beside Nile's action API.

## Bun native routes

After constructing a Bun native server, register routes before starting its listener:

```ts
const native = server.nativeRest;
if (!native) {
  throw new Error("Bun native transport was not initialized");
}

native.route("GET", "/projects/:id/preview", (context) => {
  return context.json({ projectId: context.params.id });
});

native.addMiddleware("/api", async (context, next) => {
  context.setHeader("X-Application", "team-workspace");
  await next();
  return undefined;
});

Bun.serve({ port: 8000, fetch: native.fetch });
```

Throw `createNativeHttpError(message, status)` from a route or middleware to return that HTTP status with the message. Other errors return a sanitized 500 response.

```ts
import { createNativeHttpError } from "@nilejs/nile";

native.route("GET", "/projects/:id/export", (context) => {
  const exportKey = context.request.headers.get("x-export-key");
  if (!exportKey) {
    throw createNativeHttpError("Export key required", 401);
  }

  return context.text(`export for ${context.params.id}`);
});
```

Native handlers use standard `Request` and `Response` APIs, with `context.json`, `text`, `respond`, outgoing `headers` and request-local state helpers. Routes support exact paths, named/optional parameters and a terminal wildcard. `ALL` matches any method. Exact matches take precedence; a later exact registration replaces the same method/path.

Native middleware may return a Response to stop execution, or await `next()` and modify the resulting headers. It must respond or call `next`, and must not call `next` twice. Static serving and CORS preflight occur ahead of user middleware.

## Hono routes

Existing applications can keep their Hono adapter and its plugins:

```ts
const app = server.rest?.app;
if (!app) {
  throw new Error("Hono transport was not initialized");
}

app.get("/projects/:id/preview", (context) => {
  return context.json({ projectId: context.req.param("id") });
});

server.rest?.addMiddleware("/api", async (context, next) => {
  context.header("X-Application", "team-workspace");
  await next();
});
```

Use `server.rest.addMiddleware` for middleware that must run before Nile's services handler; late `app.use` registration is not a reliable way to wrap an already registered route. The current compatibility middleware runner does not consistently adopt a directly returned Response. For a Hono services-endpoint denial, use Hono's `HTTPException` rather than relying on a returned Response:

```ts
import { HTTPException } from "hono/http-exception";

server.rest?.addMiddleware("/api", async (context, next) => {
  if (!context.req.header("X-Application-Key")) {
    throw new HTTPException(401, { message: "Application key required" });
  }
  await next();
});
```

This demonstrates a missing-header guard, not a complete key-verification policy. For business-action access, prefer an explicit [authorization hook](/guide/basics/auth).

## Reuse logic, preserve the boundary

A custom route can call ordinary business functions and access `server.context.resources`. It does not automatically run an action's schema, JWT check or hooks. Validate input and enforce the integration's signature/authentication requirements before calling the business function.

Hono Context and native context APIs are different; plugins require deliberate migration. See [runtime adapters](/guide/start/runtime-adapters).
