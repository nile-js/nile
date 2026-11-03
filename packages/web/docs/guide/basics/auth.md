---
title: "Authentication and access"
description: "Verify credentials and apply access policies before your handler runs"
---

Configure JWT verification for protected actions. Use a global before hook for role, organization or resource access checks.

## Built-in JWT verification

Configure server `auth` and mark the action `isProtected: true`. **You need both**: without server `auth`, an `isProtected` action runs for anyone.

```ts
import type { ServerConfig } from "@nilejs/nile";
import { config } from "./config";
import { services } from "./services/services.config";

export const serverConfig: ServerConfig = {
  serverName: "Team workspace",
  runtime: "bun",
  native: true,
  services,
  auth: { secret: config.jwtSecret, method: "header" },
  rest: { baseUrl: "/api", allowedOrigins: ["https://app.example.com"] },
};
```

`config.jwtSecret` is supplied by your application's configuration module. Keep it server-side.

```ts
import { createAction } from "@nilejs/nile";
import type { NileContext } from "@nilejs/nile";
import { Err, Ok } from "@nilejs/nile/fp";

const getProfileHandler = (
  data: unknown,
  context?: NileContext
) => {
  const session = context?.getSession("rest");

  if (session === undefined) {
    return Err("Sign in to continue");
  }

  return Ok({
    userId: session.userId,
    organizationId: session.organizationId,
  });
};

export const getProfile = createAction({
  name: "profile",
  description: "Read the authenticated identity",
  isProtected: true,
  handler: getProfileHandler,
});
```

The verifier requires **both** identity fields as nonempty strings:

| Session field | Accepted JWT claims |
|---|---|
| `userId` | `userId`, `id`, `sub` |
| `organizationId` | `organizationId`, `organization_id`, `orgId` |

Other claims stay on the request's `rest` session. Unprotected actions skip token verification, so a token sent to one leaves its session empty.

[Socket connections](/guide/features/websockets) verify tokens with the same `auth` settings.

| Auth setting | Default | Meaning |
|---|---|---|
| `secret` | Required | Verification key material. |
| `method` | `"header"` | `"header"` or `"cookie"`. |
| `headerName` | `"authorization"` | Header containing `Bearer <token>`. |
| `cookieName` | `"auth_token"` | Cookie read when method is `"cookie"`. |
| `algorithm` | `"HS256"` | Configured `hono/jwt` algorithm; match your issuer. |

## Verify a token outside an action

Custom routes and webhooks do not pass through an action's `isProtected` check. Call `verifyJWT` with the same `auth` settings when such a route needs the verified identity:

```ts
import { type AuthConfig, verifyJWT } from "@nilejs/nile";
import { Err, Ok } from "@nilejs/nile/fp";
import { config } from "./config";

const jwtConfig: AuthConfig = {
  secret: config.jwtSecret,
  method: "header",
};

export const verifyRequestToken = (request: Request) => {
  return verifyJWT({ headers: request.headers }, jwtConfig);
};
```

`verifyJWT(context, config)` returns `Ok(AuthResult)` with `userId`, `organizationId` and the raw `claims`, or `Err(message)`. It applies the same identity-field rules as the table above. Check the Result before you use the identity:

```ts
const verified = await verifyRequestToken(request);
if (verified.isErr) {
  return new Response("Sign in to continue", { status: 401 });
}
```

## Enforce your role policy

`accessControl` stores role labels for your own hooks to check. This global before hook requires **every listed role**:

```ts
import type { BeforeActionHandler } from "@nilejs/nile";
import { Err, Ok, type Result } from "@nilejs/nile/fp";

/** Require every role listed on a protected action. */
export const authorizeAction: BeforeActionHandler<boolean, string> = (hookContext) => {
  if (!hookContext.action.isProtected) {
    return Ok(true);
  }

  const session = hookContext.nileContext.getSession("rest");
  if (!session) {
    return Err("Sign in to continue");
  }

  const required = hookContext.action.accessControl ?? [];
  const roles = Array.isArray(session.roles) ? session.roles : [];

  const isAllowed = required.every((role) => roles.includes(role));
  if (!isAllowed) {
    return Err("Access denied");
  }

  return Ok(true);
};
```

Pass `onBeforeActionHandler: authorizeAction` to the server, configure JWT auth, and use `isProtected: true, accessControl: ["project-admin"]` on the action. Adapt the policy to your own role model. A role label says nothing about which records a user owns, so check ownership and organization in the action itself.

## Use an existing authentication provider

A global before hook can verify a Better Auth session, API key or another provider and call `nileContext.setSession("rest", identity)`. Refuse the call in that hook. When the provider handles every session, leave out built-in `auth`, or its JWT check rejects the provider's credentials first.

Read the native Request through `get<NativeRequestContext>("nativeRest")` on Bun native, or Hono Context through `get<Context>("rest")` on Hono. Provider integration and RBAC are application code.

Hooks run before input validation. Take identity from the verified session, never from an organization ID in the payload. Discovery has a [separate access gate](/guide/basics/discovery-and-agents), and CORS does not authorize an action.
