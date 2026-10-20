---
name: nile
description: Functional TypeScript backend framework for small teams. Organize business operations into services and actions with validation, Results, shared context and hooks. Bun native and Hono compatibility adapters.
license: MIT
---

# Working in a Nile application

Help the team find and extend business behavior. Begin with the application's service registry, identify the domain and action, then follow its ordinary business functions and model/repository. Respect the project's conventions rather than inventing another architecture.

Documentation: https://nile-js.github.io/nile/
Source: https://github.com/nile-js/nile

The package includes `docs/llms.txt` and `docs/llms-full.txt`, generated from the public guides. Read them for current APIs; source and exported types resolve any ambiguity. The website also provides those files for coding assistants. Runtime discovery is a separate feature.

## Learn the small set of patterns

- `createAction<Input>` binds an operation name, description, optional Zod schema and handler.
- `createService` / `createServices` group actions into business domains. Registration is explicit; folder names do not create routes.
- Handlers return `Ok(data)` or `Err(message)` from `slang-ts`. Use ordinary functions for internal work that does not need an action API.
- `safeTry` guards operations that can throw/reject and recursively unwraps nested Results in the current Slang dependency. Inspect `isErr` before `value`.
- Expected failures belong in explicit Result branches. Setup errors can still throw. Guarded handler errors can reach callers as failure messages, so deliberately return safe messages for sensitive downstream failures.

```typescript
import { createAction } from "@nilejs/nile";
import { Err, Ok } from "slang-ts";
import { z } from "zod";

const schema = z.object({ name: z.string().trim().min(1) });
type Input = z.infer<typeof schema>;

export const createProject = createAction<Input>({
  name: "create",
  description: "Create a project",
  validation: schema,
  handler: ({ name }) => {
    if (name === "system") return Err("Choose another project name");
    return Ok({ project: { id: crypto.randomUUID(), name } });
  },
});
```

This minimal example does not persist data. Put persistence in the application's chosen model or repository. Nile's Drizzle helpers are optional; they do not provision databases or run migrations. Follow the owner's approval rules before database operations.

## Connect the application

`createNileServer` builds the engine, context and selected adapter. It does not start a network listener.

New Bun projects explicitly use `runtime: "bun", native: true`; consume `server.nativeRest.fetch` with `Bun.serve`. Omitting `native` retains Hono on Bun or Node, through `server.rest.app`. Native context, route and middleware APIs differ from Hono; inspect the runtime-adapter guide before migrating.

Supply shared resources such as a logger and database through `resources`. `context.resources` and general context keys are application-shared. Request sessions (`getSession("rest")`) and action hook state are isolated. Do not put per-user identity into general `context.set` keys.

`createLogger` provides structured logging. `handleError` resolves a supplied/configured logger, logs context and returns an Err with a log identifier. It throws when no logger is available. Logging every request and distributed tracing are not automatic.

`server.stats()` returns registration counts and timings, not ongoing request metrics.

## Follow the actual execution order

1. Configured JWT authentication for a protected action.
2. Global before hook.
3. Action before hooks, sequentially.
4. Main action Zod validation.
5. Handler.
6. Action after hooks, sequentially.
7. Global after hook.

Before hooks see unvalidated input. Successful action hooks pass output to the next stage. Critical failures stop the pipeline; noncritical action-hook failures log and continue. A referenced hook calls the referenced action's handler, not its entire pipeline recursively. After hooks are not a finally block.

For built-in JWT verification, configure server `auth` and set `isProtected: true`. A valid token must supply user and organization identifiers. `accessControl` is metadata; implement and enforce role/resource policy in hooks or application functions. External providers such as Better Auth can be connected through a global hook with explicit denial and request-local session setup.

## API and frontend integration

Actions use `POST {baseUrl}/services` with `{ intent: "execute", service, action, payload }`. Handler Results become an HTTP `{ status, message, data }` envelope. Engine Result failures normally use HTTP 400; transport/custom-route errors have other status rules.

`@nilejs/client` exposes `invoke({ service, action, payload })` and returns `{ error, data }`. The CLI's `generate schema` command imports the local service registry using Bun and produces input contracts. Supply the generated input map to `createNileClient` for typed names/payloads. Handler output is not automatically inferred end to end; validate responses when needed. React Query caching and invalidation belong to the frontend integration.

## Discovery and agent tools

Discovery is off by default. Enable `rest.discovery.enabled` deliberately. If configured, its secret is sent as `payload.discoverySecret` on explore/schema requests, not as a header. This gate exposes metadata; it does not grant execution permission or filter each operation by the caller's role.

- `explore` lists services/actions and metadata.
- `schema` exports representable JSON Schema for Zod inputs.
- `execute` invokes an operation under its application policies.

Schema conversion is lazy and cached by identity. Disable globally with discovery `cacheSchemas: false` or per action with `cacheSchema: false` when dynamic schema metadata requires it. Not all Zod constructs have faithful JSON Schema representations.

The stock client discovery methods do not accept a discovery secret argument. Use the documented raw-fetch integration for protected discovery. Do not claim a built-in MCP server, automatic model tool registration or an autonomous agent runtime.

## Stay within shipped behavior

Custom HTTP routes, middleware, uploads, CORS, rate limiting and static files remain available. `server.invoke` calls the shared engine without HTTP; `rpc.enabled: false` disables that interface. `server.websocket` supplies Bun handlers/upgrades or attaches to an existing Node listener. Each message uses an isolated scope; HTTP and sockets can share a listener through `server.fetch`. Read `docs/realtime.md` for Socket.IO setup and typed send/receive topic messaging. Backend schemas infer contracts; client action/topic types may be supplied from shared, generated or frontend-defined contracts. Topic access requires server authorization. No durable replay, cross-replica fanout bridge, action streaming/SSE or built-in MCP server is supplied.

Lifecycle, Croner scheduling and functional controls are documented in `docs/v1-operations.md`. The application owns its listener; no global process signal handlers are installed. Shutdown stops admission, drains work and closes resources within a deadline. Scheduling/controls are process-local, not durable distributed queues. Cron recorder callbacks store execution history without granting once-only execution guarantees.

`context.execution` exposes correlation and cancellation metadata. Nile logs retain structured file output, and optional `createNileTelemetry` loads real OpenTelemetry exporters only when enabled. Do not capture payloads, tokens or raw errors automatically. Keep public claims scoped to the shipped implementation and verification records.

Keep work focused, preserve existing routes/configuration, use functions and readable modules, and follow the application's AGENTS rules. Explain meaningful tradeoffs instead of adding features to match an example.
