---
title: "Protected profile"
description: "Add JWT verification to the starter, read the signed-in user in an action, and enforce a role with a global before hook"
---

This example protects two actions in the starter project. `account.profile` accepts any signed-in user. `account.audit` requires the `admin` role, and a global before hook enforces that role for every action that lists it. You will sign tokens for two users with a small helper script and send requests with `curl`.

## What you need

- The starter project from the [examples overview](/guide/examples), installed with `bun install`.
- Bun can read `.env` files, so the secret stays out of source control.

## 1. Add the token helper package

The helper script signs tokens with `hono/jwt`, which the Nile Js server already uses:

```sh
bun add hono
```

You should see `1 package installed` or a similar line with no errors.

## 2. Add the secret

Create `.env` in the project root. Use your own random value of at least 32 characters:

```text
JWT_SECRET=replace-with-a-random-string-of-at-least-32-characters
```

## 3. Read the secret in one place

Create `src/config.ts`. It fails at startup when the secret is missing or too short:

```ts
const jwtSecret = process.env.JWT_SECRET;

if (jwtSecret === undefined || jwtSecret.length < 32) {
  throw new Error("JWT_SECRET must be set to at least 32 characters");
}

export const config = {
  jwtSecret: jwtSecret,
};
```

## 4. Enforce the role in a global hook

Create `src/auth/role-hook.ts`. It runs before every action. Protected actions must list roles in `accessControl`, and the signed-in user's `roles` claim must contain every listed role:

```ts
import type { BeforeActionHandler } from "@nilejs/nile";
import { Err, Ok, type Result } from "@nilejs/nile/fp";

/** Requires every role listed in a protected action's accessControl. */
export const requireRolesHook: BeforeActionHandler<boolean, string> = ({
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
```

## 5. Add the two actions

Create `src/services/account/actions/profile.ts`. It is protected, so the server verifies the token before the handler runs. The handler reads the verified identity from the session:

```ts
import { type NileContext, createAction } from "@nilejs/nile";
import { Err, Ok } from "@nilejs/nile/fp";
import { z } from "zod";

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
    profile: {
      userId: session.userId,
      organizationId: input.includeOrganization
        ? session.organizationId
        : null,
    },
  });
};

export const profileAction = createAction<ProfileInput>({
  name: "profile",
  description: "Read the signed-in user's profile",
  isProtected: true,
  validation: profileSchema,
  handler: profileHandler,
});
```

Create `src/services/account/actions/audit.ts`. It lists `admin` in `accessControl`, so the role hook checks the claim:

```ts
import { createAction } from "@nilejs/nile";
import { Ok } from "@nilejs/nile/fp";

const listAuditHandler = () => {
  return Ok({
    entries: [{ event: "profile.viewed", at: "2026-10-23T09:00:00.000Z" }],
  });
};

export const auditAction = createAction({
  name: "audit",
  description: "List audit entries for administrators",
  isProtected: true,
  accessControl: ["admin"],
  handler: listAuditHandler,
});
```

## 6. Register the service

Replace `src/services/services.config.ts` so the `account` service is registered next to `tasks`:

```ts
import { createServices, type Services } from "@nilejs/nile";
import { auditAction } from "./account/actions/audit";
import { profileAction } from "./account/actions/profile";
import { createTaskAction } from "./tasks/actions/create";
import { deleteTaskAction } from "./tasks/actions/delete";
import { getTaskAction } from "./tasks/actions/get";
import { listTaskAction } from "./tasks/actions/list";
import { updateTaskAction } from "./tasks/actions/update";

export const services: Services = createServices([
  {
    name: "tasks",
    description: "Task management with CRUD operations",
    meta: { version: "1.0.0" },
    actions: [
      createTaskAction,
      listTaskAction,
      getTaskAction,
      updateTaskAction,
      deleteTaskAction,
    ],
  },
  {
    name: "account",
    description: "Signed-in account operations",
    actions: [profileAction, auditAction],
  },
]);
```

## 7. Connect auth and the hook to the server

Replace `src/index.ts`. It adds the `auth` block, the `onBeforeActionHandler` and the JWT secret from `config`:

```ts
import { createLogger, createNileServer } from "@nilejs/nile";
import { sql } from "drizzle-orm";
import { Ok, safeTry } from "@nilejs/nile/fp";
import { requireRolesHook } from "@/auth/role-hook";
import { config } from "@/config";
import { db } from "@/db/client";
import { services } from "@/services/services.config";

const logger = createLogger("my-app", {
  mode: "dev",
  chunking: "monthly",
});

/** Push schema to PGLite on boot */
const pushSchema = async () => {
  const result = await safeTry(() =>
    db.execute(sql`
      CREATE TABLE IF NOT EXISTS tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)
  );

  if (result.isErr) {
    console.error("[pushSchema] Failed:", result.error);
  }
};

const server = await createNileServer({
  serverName: "my-app",
  runtime: "bun",
  native: true,
  project: { structure: "error" },
  services,
  resources: { logger, database: db },
  auth: { secret: config.jwtSecret, method: "header" },
  onBeforeActionHandler: requireRolesHook,
  rest: {
    baseUrl: "/api",
    host: "localhost",
    port: 8000,
    allowedOrigins: ["http://localhost:8000", "http://localhost:5173"],
    enableStatus: true,
    discovery: { enabled: true },
  },
  onBoot: {
    // The first PGlite start on a slow machine can take longer than the 10 second default.
    maxWaitTime: 30_000,
    fn: async (ctx) => {
      await pushSchema();
      ctx.resources?.logger?.info({
        atFunction: "onBoot",
        message: "my-app booted - PGLite schema ready",
      });
      return Ok(null);
    },
  },
});

if (server.nativeRest) {
  const port = server.config.rest?.port ?? 8000;
  Bun.serve({ port, fetch: server.nativeRest.fetch });
  console.log(`\nmy-app listening on http://localhost:${port}\n`);
}
```

## 8. Create the token helper

Create `scripts/issue-token.ts`. It signs a token for one user. Pass `admin` as the first argument to include the `admin` role:

```ts
import { sign } from "hono/jwt";
import { config } from "../src/config";

type TokenRequest = {
  userId: string;
  organizationId: string;
  roles: string[];
};

const ONE_HOUR_IN_SECONDS = 60 * 60;

/** Development helper: prints a signed token for the given identity. */
const issueToken = async (request: TokenRequest): Promise<string> => {
  const expiresAt = Math.floor(Date.now() / 1000) + ONE_HOUR_IN_SECONDS;
  return await sign(
    {
      userId: request.userId,
      organizationId: request.organizationId,
      roles: request.roles,
      exp: expiresAt,
    },
    config.jwtSecret
  );
};

const role = process.argv[2] === "admin" ? ["admin"] : ["member"];
const token = await issueToken({
  userId: "user_42",
  organizationId: "org_7",
  roles: role,
});
console.log(token);
```

## 9. Run and sign tokens

Start the server in one terminal:

```sh
bun run dev
```

You should see the `listening` line:

```text
my-app listening on http://localhost:8000
```

In a second terminal, sign a member token and an admin token and store them in shell variables:

```sh
MEMBER=$(bun run scripts/issue-token.ts)
ADMIN=$(bun run scripts/issue-token.ts admin)
```

Each command prints a token starting with `eyJ`. The tokens are valid for one hour.

## 10. Call the protected actions

Request the profile without a token:

```sh
curl -s -X POST http://localhost:8000/api/services \
  -H "Content-Type: application/json" \
  -d '{"intent":"execute","service":"account","action":"profile","payload":{"includeOrganization":true}}'
```

You should see HTTP 400 and the verifier's message:

```json
{"status":false,"message":"No JWT token found in header","data":{}}
```

Request the profile with the member token:

```sh
curl -s -X POST http://localhost:8000/api/services \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MEMBER" \
  -d '{"intent":"execute","service":"account","action":"profile","payload":{"includeOrganization":true}}'
```

You should see HTTP 200 with the identity from the token:

```json
{"status":true,"message":"Action 'account.profile' executed","data":{"profile":{"userId":"user_42","organizationId":"org_7"}}}
```

Request the audit action with the member token. The role hook refuses it:

```sh
curl -s -X POST http://localhost:8000/api/services \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MEMBER" \
  -d '{"intent":"execute","service":"account","action":"audit","payload":{}}'
```

You should see `Access denied` in the message. The status is HTTP 400, because Nile Js reports action failures with 400:

```json
{"status":false,"message":"Access denied","data":{}}
```

Request the same action with the admin token:

```sh
curl -s -X POST http://localhost:8000/api/services \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN" \
  -d '{"intent":"execute","service":"account","action":"audit","payload":{}}'
```

You should see HTTP 200 and the audit entries:

```json
{"status":true,"message":"Action 'account.audit' executed","data":{"entries":[{"event":"profile.viewed","at":"2026-10-23T09:00:00.000Z"}]}}
```

Public actions still work without a token. The starter's `tasks.list` returns HTTP 200 whether or not you send one.

## 11. Type-check

```sh
./node_modules/.bin/tsc --noEmit
```

You should see no output and exit with status 0.

## Troubleshooting

- **`JWT_SECRET must be set to at least 32 characters`.** The server did not find `.env`, or the value is shorter than 32 characters. Check the file location and restart `bun run dev`.
- **`JWT authentication failed: invalid token`.** The token is malformed or was signed with a different secret. Sign a new token after changing `JWT_SECRET`.

- **`JWT authentication failed: token expired`.** The token's `exp` time has passed. Sign a new token.
- **The admin token is still refused.** The token lacks the `admin` role. Sign it with `bun run scripts/issue-token.ts admin`.

A failed JWT message names the reason only, such as `token expired`, and never contains the token, so it is safe to log.

## See also

- [Authentication and hooks](/guide/features/authentication-and-hooks) explains each option used here.
- [Authentication](/guide/basics/auth) covers the session fields and external providers.
- [Realtime order updates](/guide/examples/realtime-orders) applies the same token check to a socket connection.
