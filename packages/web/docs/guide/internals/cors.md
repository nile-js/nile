---
title: "CORS"
description: "Choose allowed origins globally and for individual action routes"
---

CORS controls which browser origins may read responses. Configure it once for the application, then override it only where an operation needs a different policy. It does not prevent non-browser callers from invoking an action and must not replace authorization.

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

Use explicit trusted origins when credentials are involved. Disabling CORS with `cors: { enabled: false }` skips CORS processing and callbacks; it does not make an endpoint private.

## Action-level policy

Static action policies work with both adapters:

```ts
import { createAction } from "@nilejs/nile";
import { Ok } from "slang-ts";

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

This example demonstrates header access, not a secure partner identity check. Validate actual credentials through authentication/authorization.

Native map entries take precedence over legacy action policies. Hono callbacks use `context.req`; they must be migrated before enabling native transport. Unsupported legacy callbacks fail at setup when CORS is enabled.

## Shared preflight

All actions share the action endpoint. An OPTIONS preflight has no JSON action body, so it cannot choose an action-specific policy. The endpoint-level preflight must permit the origins, methods and headers required by intended action calls. The selected action’s policy then applies to the actual response.

Hono also supports path rules through `cors.addCors`; native supports equivalent rules with native callback types. See [runtime adapters](/guide/start/runtime-adapters) and [HTTP transport](/guide/internals/rest) before migrating middleware or custom routes.
