---
title: "Custom routes"
description: "Add HTTP routes for webhooks, downloads and streaming responses"
---

Use actions for your operations, and HTTP routes when an integration expects a particular URL, method or response. Webhooks, authentication callbacks and streaming endpoints can live beside Nile's action API.

## Bun native routes

After creating a Bun native server, register routes before starting its listener:

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

Throw `createNativeHttpError(message, status)` from a route or middleware to return that HTTP status with the message. Any other error returns a 500 response with a safe message.

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

Native handlers use standard `Request` and `Response` APIs, with `context.json`, `text`, `respond`, outgoing `headers` and request-local state helpers. Routes support exact paths, named and optional parameters, and a wildcard at the end of the path. `ALL` matches any method. An exact match wins over a pattern, and registering the same method and exact path again replaces the earlier route.

Native middleware either returns a Response to stop the request, or awaits `next()` and changes the response headers. Call `next` at most once. Static files and CORS preflight are handled before your middleware runs.

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

Use `server.rest.addMiddleware` for middleware that must run before Nile's services handler; `app.use` added later may run after the route. To refuse a request to the services endpoint, throw Hono's `HTTPException`, since a returned Response may be ignored:

```ts
import { HTTPException } from "hono/http-exception";

server.rest?.addMiddleware("/api", async (context, next) => {
  if (!context.req.header("X-Application-Key")) {
    throw new HTTPException(401, { message: "Application key required" });
  }
  await next();
});
```

The example only checks the header is present; verify the key itself in your application. For access to actions, use an [authorization hook](/guide/basics/auth).

## Share code with actions

A custom route can call your domain functions and read `server.context.resources`. It skips every action check: schema, JWT and hooks. Validate the input and verify the caller, such as a webhook signature, before calling your domain function.

Hono Context and the native context have different APIs, so Hono plugins need porting to run on Bun native. See [runtime adapters](/guide/start/runtime-adapters).
