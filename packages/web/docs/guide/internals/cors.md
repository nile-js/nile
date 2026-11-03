---
title: "CORS"
description: "Choose allowed origins globally and for individual action routes"
---

CORS controls which browser origins may read responses. Configure it once for the application, then override it only where an operation needs a different policy. Non-browser callers ignore it, so it never replaces authorization.

## Application policy

For either HTTP adapter, place CORS settings under `rest`:

```ts
rest: {
  baseUrl: "/api",
  allowedOrigins: ["https://office.example.com"],
  cors: {
    defaults: {
      credentials: true,
      allowHeaders: ["Content-Type", "Authorization"],
      allowMethods: ["POST", "OPTIONS"],
    },
  },
}
```

Use explicit trusted origins when credentials are involved. `cors: { enabled: false }` skips CORS headers and callbacks; the endpoint stays reachable.

## Action-level policy

Static action policies work with both adapters:

```ts
import { createAction } from "@nilejs/nile";
import { Ok } from "@nilejs/nile/fp";

const readReportHandler = () => {
  return Ok({ available: true });
};

const readReport = createAction({
  name: "read",
  description: "Read a report",
  cors: { origin: "https://office.example.com" },
  handler: readReportHandler,
});
```

Set `cors: false` on an action to omit its actual-response CORS headers. `cors: true` inherits the application policy. Static policies are prepared at setup; recreate the transport after changing them.

## Native callbacks

Bun native callbacks receive `NativeRequestContext`. Define native-specific action policies through the server map:

```ts
rest: {
  baseUrl: "/api",
  allowedOrigins: ["https://office.example.com"],
  cors: {
    actions: {
      reports: {
        read: {
          origin: (origin, context) =>
            context.request.headers.has("X-Partner") ? origin : null,
        },
      },
    },
  },
}
```

The example only reads a header; verify a partner's identity with authentication.

Native map entries win over policies set on the action. Hono callbacks use `context.req`, so port them before enabling Bun native; a Hono callback left on a native server fails at setup when CORS is enabled.

## Shared preflight

All actions share one endpoint. An OPTIONS preflight carries no action body, so it uses the endpoint policy, which must allow the origins, methods and headers your action calls need. The selected action’s policy then applies to the actual response.

Hono also supports path rules through `cors.addCors`; native supports equivalent rules with native callback types. See [runtime adapters](/guide/start/runtime-adapters) and [HTTP transport](/guide/internals/rest) before migrating middleware or custom routes.
