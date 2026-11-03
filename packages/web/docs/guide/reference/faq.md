---
title: "FAQ"
description: "Answers to common questions about Nile applications and their tradeoffs"
---

## Who is Nile for?

Small teams building growing business applications: internal tools, dashboards, billing systems and product backends. A few conventions give each operation a recognizable home, so each new feature follows the structure already in place.

The maintainer uses Nile for a fintech backend with over 500 actions, an internal Back Office shipped in days, and Wi-Fi billing receiving thousands of requests a day. These are the maintainer's own projects, not independent measurements.

## Does Nile enforce domain-driven design?

Yes, so the codebase stays navigable as it grows. Each domain is a service under `src/services`, listed in the `services.config.ts` registry, with one file per action. Nile checks that layout at startup and reports misplaced or oversized action files. A violation stops startup by default. Set `project: { structure: "warn" }` explicitly to continue with warnings, or `false` to disable the check.

Inside that layout, aggregates and repositories stay your choice. Domain rules live in each service's `modules/`, and only operations you expose to callers become actions.

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

Nile builds its action lookup once at startup, so finding an action takes the same time however many you register. Parsing, validation, hooks, your handler and the response still take time.

Use meaningful operation names and register each action in its service. Use [custom routes](/guide/basics/custom-routes) for webhooks, health checks and other HTTP needs.

## What happens when an action fails?

Return `Err(message)` for an expected failure and `Ok(data)` for success. An unexpected throw in a handler also becomes a failed Result, with a safe message. HTTP responses use a `status`, `message`, `data` envelope; the client exposes its own response shape.

Invalid startup configuration throws, and a transport error can return HTTP 500, so Results cover your actions, not the whole process. See [errors and Results](/guide/basics/errors-and-results).

## Does Nile handle access control?

Nile can verify JWTs for protected actions when server authentication is configured. Your application implements role, organization and resource policies through hooks or business logic. `accessControl` labels take effect only through your hook. [Authentication](/guide/basics/auth) explains the split.

## Are sessions persistent?

No. A request session holds identity and state for the current request only. Save progress that spans requests in your own storage and load it when needed.

## How does the frontend connect?

Use `@nilejs/client` to call named actions over HTTP and to send and receive [topic messages](/guide/features/websockets) through `nile.socket`. The CLI generates input types from your service registry, so the client checks operation names and payloads; response types stay unknown until you validate them. See the [client guide](/guide/basics/client).

## Can agents discover and execute operations?

When you enable discovery, `explore` and `schema` return operation metadata and input schemas. Your agent integration, such as an MCP server you write, selects the allowed tools, supplies credentials and calls the actions. Discovery is off by default.

A predictable layout also helps coding agents read your code, with or without runtime discovery. See [discovery and agents](/guide/basics/discovery-and-agents).

## What is cached?

JSON Schema conversions run on request and are cached by default. Nile caches no action results; data caches and invalidation are part of your application. Discovery cache controls are documented in the discovery guide.

## Must I use Bun, Hono or Drizzle?

Choose Bun native explicitly with `runtime: "bun", native: true`. Hono is the default adapter and runs on Bun and Node.js. The two adapters have different middleware and request-context APIs.

Choose your own database and data-access modules. Nile’s Drizzle helpers are optional. Read [runtime adapters](/guide/start/runtime-adapters) and [data access](/guide/internals/db/).

## What about performance?

The [performance page](/guide/reference/performance) includes recorded measurements, methodology and reproducible sources. They describe one workload on one machine. Discussion happens in the [repository issues](https://github.com/nile-js/nile/issues).
