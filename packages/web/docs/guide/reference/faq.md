---
title: "FAQ"
description: "Answers to common questions about Nile applications and their tradeoffs"
---

## Who is Nile for?

Small teams building growing business applications: internal tools, dashboards, billing systems and product backends. A few conventions give each operation a recognizable home, so adding another feature does not require inventing another application structure.

The maintainer uses Nile for a fintech backend with over 500 actions, an internal Back Office shipped in days, and Wi-Fi billing receiving thousands of requests a day. These are in-house accounts, not independent performance or delivery guarantees.

## Does Nile enforce domain-driven design?

Yes, so the codebase still scales as it grows. Each business domain is a service under `src/services`, listed in the `services.config.ts` registry, with one file per action. Nile checks that layout at startup and reports misplaced or oversized action files. With `project: { structure: "error" }`, as in the CLI starter, a violation stops startup; existing applications get warnings by default.

Inside that layout, aggregates and repositories stay your choice. Ordinary functions can contain business rules; only operations exposed through the action API need to become actions.

Start with the [application structure guide](/guide/start/application-structure).

## How are actions addressed?

Send `POST /api/services` when `rest.baseUrl` is `/api`. The body identifies the operation:

```json
{
  "intent": "execute",
  "service": "projects",
  "action": "create",
  "payload": { "name": "Customer portal" }
}
```

Nile registers named operations at startup and resolves them through precomputed lookups. This keeps dispatch independent of scanning the entire action collection. Parsing, validation, hooks, business logic and response serialization still take time; constant-time lookup does not imply constant request cost or guaranteed throughput.

Use meaningful operation names and register each action in its service. [Custom routes](/guide/basics/custom-routes) remain available for webhooks, health checks and other HTTP needs.

## What happens when an action fails?

Return `Err(message)` for an expected failure and `Ok(data)` for success. Guarded handler execution converts unexpected handler failures into a failed Result. HTTP responses use a `status`, `message`, `data` envelope; the client exposes its own response shape.

Startup configuration errors can throw, and transport errors can return HTTP 500. The Result convention does not make applications crash-proof. See [errors and Results](/guide/basics/errors-and-results).

## Does Nile handle access control?

Nile can verify JWTs for protected actions when server authentication is configured. Your application implements role, organization and resource policies through hooks or business logic. `accessControl` metadata alone does not enforce a policy. [Authentication](/guide/basics/auth) explains the boundary.

## Are sessions persistent?

No. Request sessions carry identity/state within the current request. They are not a cross-request session database. Persist workflow progress in your application’s chosen storage and load it explicitly when needed.

## How does the frontend connect?

Use `@nilejs/client` to invoke named actions. The CLI can generate service/action input types from the local service registry using Bun. This checks operation names and payloads when supplied to the client; it does not automatically infer server return types end to end. See the [client guide](/guide/basics/client).

## Can agents discover and execute operations?

When explicitly enabled, `explore` and `schema` expose operation metadata and supported input schemas. An agent integration still needs to select permitted tools, supply credentials, validate its inputs and invoke actions. Discovery is disabled by default. Nile does not ship an MCP server or universal model adapter.

Predictable code organization also helps coding agents navigate an application. That is separate from runtime discovery. See [discovery and agents](/guide/basics/discovery-and-agents).

## What is cached?

JSON Schema conversions are performed on demand and cached by default. Action results are not automatically cached. Your application owns data caches, invalidation and any persistent state. Discovery cache controls are documented in the discovery guide.

## Must I use Bun, Hono or Drizzle?

Choose Bun native explicitly with `runtime: "bun", native: true`. Existing applications retain the Hono adapter by default; it supports Bun and Node. Their middleware and request-context APIs differ.

Choose your own database and data-access modules. Nile’s Drizzle helpers are optional. Read [runtime adapters](/guide/start/runtime-adapters) and [data access](/guide/internals/db/).

## What about performance and future features?

The [performance page](/guide/reference/performance) includes recorded measurements, methodology and reproducible sources. They describe a specific workload and machine. Follow [repository issues](https://github.com/nile-js/nile/issues) for current discussion.
