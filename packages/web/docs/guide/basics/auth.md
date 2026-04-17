# Authentication

Nile includes built-in JWT authentication via `hono/jwt`. Protected actions require a valid JWT token before the handler executes.

## Configuration

Pass an `auth` object to your server config:

```typescript
import { createNileServer } from "@nilejs/nile";

const server = await createNileServer({
  serverName: "MyApp",
  services: [/* ... */],
  auth: {
    secret: process.env.JWT_SECRET!,
    method: "header", // "header" (default) or "cookie"
  },
  rest: {
    baseUrl: "/api/v1",
    allowedOrigins: ["http://localhost:3000"],
  },
});
```

## Auth Config Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `secret` | `string` | *required* | JWT secret for token verification |
| `method` | `"header" \| "cookie"` | `"header"` | Where to look for the token |
| `headerName` | `string` | `"authorization"` | Header name (when method is `"header"`) |
| `cookieName` | `string` | `"auth_token"` | Cookie name (when method is `"cookie"`) |
| `algorithm` | `JwtAlgorithm` | `"HS256"` | JWT signing algorithm for token verification |

### Supported JWT Algorithms

The `algorithm` option accepts any algorithm supported by `hono/jwt`:

| Family | Algorithms |
|--------|------------|
| HMAC | `HS256`, `HS384`, `HS512` |
| RSA | `RS256`, `RS384`, `RS512` |
| RSA-PSS | `PS256`, `PS384`, `PS512` |
| ECDSA | `ES256`, `ES384`, `ES512` |
| EdDSA | `EdDSA` |

```typescript
auth: {
  secret: process.env.JWT_SECRET!,
  algorithm: "RS256", // Use RSA-256 instead of default HMAC-256
}
```

## Protecting Actions

Set `isProtected: true` on any action that requires authentication:

```typescript
import { Ok, Err } from "slang-ts";
import { createAction, type Action } from "@nilejs/nile";

export const getProfile: Action = createAction({
  name: "getProfile",
  description: "Get the current user's profile",
  isProtected: true,
  handler: (data, context) => {
    const session = context?.getSession("rest");
    if (!session) return Err("Not authenticated");

    return Ok({
      userId: session.userId,
      organizationId: session.organizationId,
    });
  },
});
```

When `isProtected` is `true` and `auth` is configured on the server:

1. The engine extracts the JWT from the request (header or cookie)
2. Verifies the token signature using `hono/jwt`
3. Extracts `userId` and `organizationId` from the claims
4. Stores auth data in the session via `setSession("rest", { userId, organizationId, ...claims })`
5. If verification fails, the action returns an error without executing

Actions without `isProtected` (or with `isProtected: false`) skip auth entirely.

## Accessing Auth Data

Inside any handler or hook, use `getSession("rest")` to access auth data:

```typescript
// Auth session data (userId, organizationId, JWT claims)
const session = context?.getSession("rest");
// { userId: "usr_123", organizationId: "org_456", role: "admin", ... }
```

Returns `undefined` when no authentication occurred (e.g., unprotected actions).

## JWT Claims Mapping

The JWT handler extracts identity fields from standard and common claim names:

| Field | Supported claim names |
|-------|----------------------|
| `userId` | `userId`, `id`, `sub` |
| `organizationId` | `organizationId`, `organization_id`, `orgId` |

All other claims are preserved in the session object.

## Token Sources

### Authorization Header (default)

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

```typescript
auth: {
  secret: "your-secret",
  method: "header",
  // headerName: "authorization" (default)
}
```

### Cookie

```typescript
auth: {
  secret: "your-secret",
  method: "cookie",
  cookieName: "session_token",
}
```

## Custom Auth with Hooks

For auth logic beyond JWT (RBAC, API keys, OAuth sessions), use `onBeforeActionHandler` as a middleware gate:

```typescript
const server = await createNileServer({
  serverName: "MyApp",
  services: [/* ... */],
  auth: { secret: process.env.JWT_SECRET! },
  onBeforeActionHandler: async ({ nileContext, action, payload }) => {
    const session = nileContext.getSession("rest");
    if (!session) return Ok(payload); // Unprotected action, let it through

    // Custom RBAC check
    const requiredRole = action.accessControl?.[0];

    if (requiredRole && session.role !== requiredRole) {
      return Err(`Requires role: ${requiredRole}`);
    }

    return Ok(payload);
  },
});
```

The hook runs after JWT verification but before the action handler, giving you access to the verified user data for custom authorization logic.

## Example: Full Setup

```typescript
import { createNileServer, createAction, type Action } from "@nilejs/nile";
import { Ok, Err } from "slang-ts";
import z from "zod";

// Public action, no auth required
const listItems: Action = createAction({
  name: "listItems",
  description: "List all items",
  handler: () => Ok({ items: [] }),
});

// Protected action, requires valid JWT
const createItem: Action = createAction({
  name: "createItem",
  description: "Create a new item",
  isProtected: true,
  validation: z.object({ title: z.string().min(1) }),
  handler: (data, context) => {
    const session = context?.getSession("rest");
    return Ok({
      id: crypto.randomUUID(),
      title: data.title,
      createdBy: session?.userId,
    });
  },
});

const server = await createNileServer({
  name: "ItemService",
  services: [
    {
      name: "items",
      description: "Item management",
      actions: [listItems, createItem],
    },
  ],
  auth: {
    secret: process.env.JWT_SECRET!,
    method: "header",
  },
  rest: {
    baseUrl: "/api/v1",
    allowedOrigins: ["http://localhost:3000"],
  },
});

export default server.rest?.app;
```
