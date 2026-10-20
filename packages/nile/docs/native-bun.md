# Bun native transport

Select Bun native with `runtime: "bun", native: true`. REST settings stay under `rest`; the resulting native handler, routes and middleware are exposed on `server.nativeRest`. Existing applications that omit `native` (or set it to `false`) retain the Hono adapter and `server.rest.app`, on both Bun and Node.js. Hono remains supported; no deprecation is introduced in this release. New CLI projects explicitly select Bun native.

Configure one adapter per Nile instance. Bun native requires an explicit Bun runtime; selecting it with Node.js or without `runtime: "bun"` fails at setup. Changing an existing application to Bun native is opt-in and requires migrating its Hono-specific APIs as described below.

```ts
import { createNileServer } from "@nilejs/nile";

const server = await createNileServer({
  serverName: "My application",
  services,
  runtime: "bun",
  native: true,
  rest: {
    baseUrl: "/api",
    allowedOrigins: ["https://app.example"],
    enableStatus: true,
  },
});
const native = server.nativeRest;
if (!native) throw new Error("Native transport was not initialized");
Bun.serve({ fetch: native.fetch });
```

The factory builds handlers without starting a listener. Bun's server options control deployment settings such as port and hostname. Native transport implements JSON and multipart RPC, authentication, global/local hooks, validation, Result handling, discovery/schema caching, CORS, static assets, rate limiting, status, custom routes and middleware. Per-request sessions and nested/concurrent action isolation use the same core engine as the Hono adapter.

## Migrating request access

Native applications use `nileContext.get<NativeRequestContext>("nativeRest")` instead of requesting a Hono context with `get("rest")`. Session methods still use the `rest` session key, including the authenticated identity. Shared resources, `getContext`, engine calls and startup statistics retain their existing behavior.

The native request context exposes:

- `request`: the actual standard Request; read headers, cookies, URL and body through Web APIs.
- `path`, `params`: pathname and decoded named route parameters.
- `headers`, `setHeader(name, value)`: outgoing headers; append multiple Set-Cookie values with `headers.append`.
- `json(body, status?)`, `text(body, status?)`, `respond(response)`: response creation/adoption; `response` holds the current response.
- `state`, `get(key)`, `set(key, value)`: request-local middleware state, distinct from global NileContext storage.
- `parseBody()`: cached multipart parsing with repeated-field and bracket-array behavior.

Standard Response bodies support streaming. Adopting immutable Fetch responses creates mutable headers for subsequent middleware/CORS processing. HEAD responses have no body.

## Migrating middleware, routes and HTTP errors

```ts
import { createNativeHttpError } from "@nilejs/nile";

native.addMiddleware("/api", async (context, next) => {
  context.setHeader("X-Application", "my-app");
  await next();
});
native.route("GET", "/users/:id", (context) => {
  return context.json({ id: context.params.id });
});
native.route("GET", "/private", () => {
  throw createNativeHttpError("Forbidden", 403);
});
```

Register routes with `route(method, path, handler)`, using exact paths, named parameters, optional named parameters or a terminal wildcard. `ALL` matches any method. Exact routes take precedence; a later exact registration replaces that method/path. Explicit HEAD routes take precedence over GET fallback. Native APIs replace Hono `app.get/post/use/route/onError`; Hono plugins and callbacks require migration.

Middleware keeps late registration, prefix matching and onion ordering across RPC, custom routes, status and 404 responses. It can return a Response to short-circuit, or await `next()` and modify the resulting headers. The maximum remains 50 registrations. Calling next twice or completing without a response/next produces a sanitized internal error. Static files and preflight remain ahead of user middleware, as in the existing stack.

Unexpected errors return sanitized500 JSON. Deliberate native HTTP errors preserve their400–599 status;500 messages are sanitized. Return an explicit JSON/Response for an intentional custom 500 body. Engine Result failures remain400. Middleware returning a Response works directly; the Hono adapter's pre-existing returned-Response runner quirk is not copied into the new API.

## Authentication

Keep the existing top-level `auth` configuration and action `isProtected`. Bearer/custom header and cookie/custom cookie methods, configured JWT algorithms, claims validation and session identity use the existing tested verifier. Request extraction now reads native Request headers/cookies. Authentication runs before global hooks, so hooks can read `getSession("rest")` as before. Hono-specific request access inside hooks must migrate to the native key/API.

## CORS and discovery

Global defaults, allowed origins, path options/resolvers, credentials, methods/headers, maxAge, exposed headers, Vary, shared preflight and per-action disabling/overrides remain available. Callbacks now receive NativeRequestContext. Static `action.cors` settings and boolean flags carry over. Migrate Hono-context action callbacks to the native action-policy map:

```ts
runtime: "bun",
native: true,
rest: {
  baseUrl: "/api",
  allowedOrigins: ["https://app.example"],
  cors: {
    actions: {
      reports: {
        read: { origin: (origin, context) => context.request.headers.has("X-Partner") ? origin : null },
        internal: false,
      },
    },
  },
}
```

The native map takes precedence over the action's legacy policy. `true` explicitly chooses inheritance. Unmigrated Hono callbacks fail at setup when CORS is enabled; global hard-off skips all CORS callbacks. Policies compile at startup; recreate the transport after static policy changes. OPTIONS remains endpoint-level because its request has no action JSON body. The shared preflight must permit origins/headers required by action overrides. CORS is not authorization.

Discovery uses the same disabled-by-default gate, optional secret, visibility rules and lazy schema cache. Global `cacheSchemas: false` and action `cacheSchema: false` remain effective; replacement schema roots refresh conversion.

## Multipart, static files and rate limits

Uploads retain limits, MIME signatures, extensions, sizes, counts, content-type enforcement and existing field/file payload shapes. This port deliberately retains current quirks: uploadMode is ignored by the legacy entry point, mixed field/file keys are rejected in both modes, action routing metadata is removed while intent/service remain in fields. Changes to those semantics require a separate fix.

Static serving uses the same enableStatic/staticDir options and `/assets/*` namespace, with GET/HEAD, directory index, MIME/length headers and Bun file streaming. Missing files fall through. The native implementation rejects traversal and symlink escapes and fails fast on filesystem permission/configuration errors. Enabling static serving creates a missing configured directory.

Rate limiting retains the configured client header, forwarded/real-IP fallback, defaults, headers and429 behavior. Native custom stores implement increment/decrement/resetKey and optional get/resetAll/shutdown/init; their options and request state are native rather than Hono plugin objects. Store errors fail closed to sanitized500. The in-memory store rotates lazily without a background timer. User-owned stores remain responsible for their external lifecycle.

## Verification and performance

Feature tests cover native capabilities and interactions, including authentication, discovery secrets/cache, multipart limits, CORS/preflight/errors, middleware/routes/status, rate limits, static path safety, cookies/streaming and nested/concurrent isolation. The public performance guide links the reproducible benchmark suite, recorded data and adapter limitations: https://nile-js.github.io/nile/guide/reference/performance. JSON-only prototype results are not a complete-adapter performance claim.

Measurements on the owner’s everyday PC include background desktop activity. Expect variance between runs; compare interleaved rounds and report their spread before drawing conclusions about small differences.
