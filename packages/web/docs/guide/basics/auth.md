# Apply access rules consistently

As more operations are added, a common policy boundary helps the team avoid repeating authentication code. Nile includes JWT verification; role, organization and resource-level authorization remain explicit application rules.

## Built-in JWT verification

Configure server `auth` and mark the action `isProtected: true`. **Both are required**: `isProtected` alone does not enable verification.

```typescript
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

```typescript
import { createAction } from "@nilejs/nile";
import { Err, Ok } from "slang-ts";

export const getProfile = createAction({
  name: "profile",
  description: "Read the authenticated identity",
  isProtected: true,
  handler: (_input, context) => {
    const session = context?.getSession("rest");
    if (!session) return Err("Sign in to continue");
    return Ok({ userId: session.userId, organizationId: session.organizationId });
  },
});
```

The verifier requires **both** identity fields as nonempty strings:

| Session field | Accepted JWT claims |
|---|---|
| `userId` | `userId`, `id`, `sub` |
| `organizationId` | `organizationId`, `organization_id`, `orgId` |

Other claims remain available on the request-local `rest` session. Unprotected actions skip built-in token verification; merely sending a token does not populate their session.

| Auth setting | Default | Meaning |
|---|---|---|
| `secret` | Required | Verification key material. |
| `method` | `"header"` | `"header"` or `"cookie"`. |
| `headerName` | `"authorization"` | Header containing `Bearer <token>`. |
| `cookieName` | `"auth_token"` | Cookie read when method is `"cookie"`. |
| `algorithm` | `"HS256"` | Configured `hono/jwt` algorithm; match your issuer. |

## Enforce your role policy

`accessControl` stores policy labels; it does not enforce them automatically. This example defines an **all-listed-roles** policy in a global before hook:

```typescript
import type { BeforeActionHandler } from "@nilejs/nile";
import { Err, Ok } from "slang-ts";

/** Require every role listed on a protected action. */
export const authorizeAction: BeforeActionHandler<boolean, string> = ({
  nileContext,
  action,
}) => {
  if (!action.isProtected) return Ok(true);

  const session = nileContext.getSession("rest");
  if (!session) return Err("Sign in to continue");

  const roles = session.roles;
  if (action.accessControl?.length && !Array.isArray(roles)) {
    return Err("Access denied");
  }
  const isAllowed = (action.accessControl ?? []).every(
    (role) => Array.isArray(roles) && roles.includes(role),
  );
  return isAllowed ? Ok(true) : Err("Access denied");
};
```

Pass `onBeforeActionHandler: authorizeAction` to the server, configure JWT auth, and use `isProtected: true, accessControl: ["project-admin"]` on the action. Adapt the policy to your actual role model. Check resource ownership and organization boundaries in the appropriate domain operation; a role label alone is insufficient.

## Use an existing authentication provider

A global before hook can verify a Better Auth session, API key or another provider and call `nileContext.setSession("rest", identity)`. Enforce denial in that hook rather than relying on Nile's JWT switch. If using external sessions exclusively, omit built-in `auth` so its verifier does not reject the provider's credentials first.

Read the native Request through `get<NativeRequestContext>("nativeRest")` on Bun native, or Hono Context through `get<Context>("rest")` on Hono. Provider integration and RBAC are application code.

Hooks run before input validation. Never trust a payload organization ID as the authenticated identity. Discovery has a [separate access gate](/guide/basics/discovery-and-agents), and CORS does not authorize an action.
