---
title: "Authentication and hooks"
description: "Protect actions with JWT verification, enforce required roles and run checks before or after an action"
---

Nile Js verifies JWTs for actions you mark as protected, and it runs hooks around every action. Use the built-in verifier for identity, a global before hook for policy such as roles, and local hooks for steps that belong to one action.

## When to use it

Use `isProtected` for any action that needs a signed-in user. Use `accessControl` to list the roles an action requires, then enforce that list in a hook, because Nile stores the labels but does not check them. Use local hooks when one action needs a shared step, such as loading a policy, before its handler runs.

## Complete example

This file configures JWT verification and a global before hook that checks every role an action lists. `config.jwtSecret` comes from your configuration module and must stay on the server.

```ts
import {
  type BeforeActionHandler,
  createAction,
  createNileServer,
  createServices,
} from "@nilejs/nile";
import type { NileContext } from "@nilejs/nile";
import { Err, Ok, type Result } from "@nilejs/nile/fp";
import { z } from "zod";

const requireRolesHook: BeforeActionHandler<boolean, string> = ({
  nileContext,
  action,
}): Result<boolean, string> => {
  if (!action.isProtected) {
    return Ok(true);
  }

  const session = nileContext.getSession("rest");
  if (session === undefined) {
    return Err("Sign in to continue");
  }

  const requiredRoles = action.accessControl ?? [];
  if (requiredRoles.length === 0) {
    return Ok(true);
  }

  const roles = session.roles;
  const hasEveryRole =
    Array.isArray(roles) &&
    requiredRoles.every((role) => roles.includes(role));

  if (!hasEveryRole) {
    return Err("Access denied");
  }

  return Ok(true);
};

const profileSchema = z.object({
  includeOrganization: z.boolean().optional().default(false),
});

type ProfileInput = z.infer<typeof profileSchema>;

const profileHandler = (
  input: ProfileInput,
  context?: NileContext<unknown>
) => {
  const session = context?.getSession("rest");
  if (session === undefined) {
    return Err("Sign in to continue");
  }

  return Ok({
    userId: session.userId,
    organizationId: input.includeOrganization ? session.organizationId : null,
  });
};

const profileAction = createAction<ProfileInput>({
  name: "profile",
  description: "Read the signed-in user profile",
  isProtected: true,
  validation: profileSchema,
  handler: profileHandler,
});

const invoicesAction = createAction<ProfileInput>({
  name: "invoices",
  description: "List invoices for billing administrators",
  isProtected: true,
  accessControl: ["billing-admin"],
  validation: profileSchema,
  handler: profileHandler,
});

const services = createServices([
  {
    name: "account",
    description: "Account operations",
    actions: [profileAction, invoicesAction],
  },
]);

export const server = await createNileServer({
  serverName: "team-workspace",
  services: services,
  auth: { secret: config.jwtSecret, method: "header" },
  onBeforeActionHandler: requireRolesHook,
  rest: { baseUrl: "/api", allowedOrigins: ["https://app.example.com"] },
});
```

The `account.profile` action needs any valid token. The `account.invoices` action needs a token whose `roles` claim includes `billing-admin`. The runnable version of this pattern, with token generation and requests, is in [the protected profile example](/guide/examples/protected-profile).

With no token, a protected action returns:

```json
{
  "status": false,
  "message": "No JWT token found in header",
  "data": {}
}
```

A token that is valid but lacks the required role returns `Access denied` with the same envelope. Both are HTTP 400.

## Options that matter

| Where | Option | Effect |
| --- | --- | --- |
| Server | `auth.secret` | Key used to verify tokens. Required when any action is protected. |
| Server | `auth.method` | `"header"` (default) reads `Authorization: Bearer`. `"cookie"` reads `auth_token` by default. |
| Server | `auth.headerName`, `auth.cookieName`, `auth.algorithm` | Change the source header or cookie name, or the algorithm (`HS256` by default). |
| Server | `onBeforeActionHandler` | Global check that runs for every action, after JWT verification. |
| Action | `isProtected` | Requires verified JWT. Both `auth` and `isProtected` must be set. |
| Action | `accessControl` | Role labels. Enforced only by your hook. |
| Action | `hooks.before`, `hooks.after` | Local hooks that run another action's handler. Set `isCritical` to decide whether a failure stops the action. |

The verifier requires `userId` (or `id` or `sub`) and `organizationId` (or `organization_id` or `orgId`) as non-empty strings. Other claims, such as `roles`, remain on the request session as `getSession("rest")`.

## How it behaves

- Nile runs JWT verification first for protected actions, then the global before hook, then local before hooks, validation, the handler, local after hooks and the global after hook.
- The global before hook runs for every action. Return `Ok(true)` to continue. Its returned value does not replace the payload.
- A local hook runs its referenced action's handler directly. It does not run that action's JWT check, validation or hooks. Put required checks inside the hook's handler.
- Unprotected actions skip token verification. Sending a token to them does not populate their session.
- `auth` also verifies tokens from HTTP requests for protected actions. Custom routes do not run the action check. Use `verifyJWT` there, as shown in [authentication](/guide/basics/auth).

## Limits

- Verification failures return a fixed message: `JWT authentication failed: token expired`, `JWT authentication failed: invalid token`, or a short reason for issuer, audience, algorithm or timing problems. The message never contains the token, its header or its claims, so it is safe to log.
- Role checks only protect the actions that use them. Check resource ownership inside the domain operation.
- Discovery has its own secret gate. It does not inherit JWT or role checks.

## Common mistakes

- Setting `isProtected` without an `auth` block. Protection needs both.
- Writing `accessControl` and expecting Nile to enforce it. Your hook must read `action.accessControl`.
- Trusting an `organizationId` in the payload. Compare it with the verified session.
- Putting the JWT secret in client code or in a committed file.

## See also

- [Authentication](/guide/basics/auth) covers the session fields and external providers.
- [Hooks and pipelines](/guide/basics/hooks-and-pipelines) gives the full order of steps.
- [Composing hooks](/guide/advanced/composing-hooks) shows a multi-step local hook pipeline.
- [Protected profile example](/guide/examples/protected-profile) runs this pattern end to end.
