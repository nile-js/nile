# Framework Comparison

> Objective comparison based on actual codebase analysis of the Nile project.

---

## What Nile IS

Nile is a **TypeScript-first, service-action backend framework** built on **Hono** (HTTP), **Zod** (validation), and **slang-ts** (Result pattern). It uses a **single POST endpoint** where all communication flows through `POST /services` with an `intent` field (`explore`, `execute`, `schema`).

Nile is not REST. It's not RPC. It's not trying to fit into either category. The single-POST interface is a transport detail — behind it sits a full application framework with an execution engine, hook pipelines, built-in JWT auth, file upload handling, structured logging, and a typed client SDK. The better label is **service-action framework**: you define domains (services) and operations (actions), and the framework handles discovery, validation, auth, execution, and consistent response formatting.

The architecture emerged around the same time as Anthropic's MCP (Model Context Protocol) and landed on similar patterns — named operations, typed inputs, built-in discovery — from a completely different starting point. MCP is a protocol for AI-to-tool communication. Nile is a framework for building backends. The structural similarity means that a Nile backend is inherently AI-agent-ready without needing MCP as a middleman: every action already has a name, description, and typed schema that any agent can discover and invoke through the same endpoint applications use.

Key architectural choices:

- **Functional, factory-based** — no classes, no decorators, no DI containers
- **Result pattern everywhere** — `Ok(data)` / `Err(message)`, no try/catch
- **Service -> Action hierarchy** — services group actions; actions are plain objects with `name`, `handler`, optional `validation` (Zod), optional `hooks`
- **AI-agent ready by default** — every action with a Zod schema auto-exports JSON Schema via the `schema` intent. No adapter layer, no MCP server, no separate tool definitions to maintain
- **Honest trade-offs** — no HTTP verb semantics means no browser-level caching. Nile targets dashboards, internal tools, and business logic APIs where application-level caching is more appropriate
- **Monorepo**: `@nilejs/nile` (core), `@nilejs/client` (zero-dep typed client), `@nilejs/cli` (scaffolding/codegen)

---

## Comparison Table

| Aspect | **Nile** | **tRPC** | **GraphQL** | **Elysia** | **NestJS** |
|---|---|---|---|---|---|
| **Identity** | Service-action framework | End-to-end TS type-safe RPC | Query language + runtime | Bun-native HTTP framework | Enterprise OOP framework |
| **Philosophy** | Functional, domain-driven actions with built-in AI discoverability | Zero-codegen type safety across client/server | Flexible query language for complex data graphs | Raw performance, Bun-native | Angular-inspired enterprise patterns |
| **Paradigm** | Functional factories | Functional procedures | Schema-first or code-first | Functional with method chaining | Class-based, decorator-heavy OOP |
| **Transport** | Single POST endpoint, intent-based | HTTP/WebSocket, procedure-based | Single POST endpoint, query-based | Full HTTP method routing | Full HTTP method routing |
| **Type Safety** | Zod schemas + CLI codegen -> typed client (no monorepo required) | Inferred types, zero codegen, monorepo-tight | Schema types + codegen (e.g., graphql-codegen) | Zod/TypeBox schema inference | Decorators + class-validator |
| **Routing** | O(1) pre-computed `service->action` map lookups | Procedure routers, nested | Single endpoint, resolver-based | Radix-tree HTTP router (Bun-optimized) | Express/Fastify controller decorators |
| **Auth** | Built-in JWT (header/cookie), per-action `isProtected`, RBAC via hooks | None (bring your own) | None (bring your own) | Guard system | Guards + Passport integration |
| **Middleware** | Global before/after hooks + per-action hooks, sequential pipeline with `isCritical` control | Middleware via context | Resolver middleware, directives | Lifecycle hooks, derive, guard | Guards, interceptors, pipes, filters |
| **Error Handling** | Result pattern (`Ok`/`Err`), `handleError` for logged errors, `safeTry` crash safety | Result-like with error formatting | Error extensions in responses | Throw or return errors | Exception filters, throw HttpException |
| **Validation** | Zod (runtime), auto-generated from Drizzle tables | Zod (inferred at compile time) | Schema-level type checking | Zod/TypeBox with type inference | class-validator decorators |
| **File Uploads** | Built-in multipart FormData parsing with validation (size, count, MIME) | None (bring your own) | multipart via Apollo Upload | Multipart via Elysia plugin | Multer integration |
| **Caching** | Application-level (Redis, in-memory). No HTTP-level caching (deliberate trade-off). Client-side via React Query/SWR | Application-level | HTTP caching + persisted queries | Full HTTP caching (ETags, Cache-Control) | Full HTTP caching |
| **DX** | Simple: define action -> register in service -> done. CLI scaffolds | Excellent: autocomplete across client/server | Steep learning curve, powerful tooling | Fast setup, ergonomic API | Heavy boilerplate, comprehensive docs |
| **Performance** | Hono + Bun + O(1) lookups — no route matching overhead at any scale. Benchmarks pending | Lightweight runtime | Resolver overhead, N+1 risk | Fastest (Bun-native benchmarks) | Moderate (abstraction layers) |
| **Scalability** | Immutable after boot, duplicate detection at startup | Monorepo-biased | Excellent for distributed/federated | Promising for edge/serverless | Enterprise-proven microservices |
| **AI/Agent Support** | **Built-in**: `explore` + `schema` intents = complete tool interface. No MCP layer needed | Not built-in | Introspection exists but not agent-targeted | Not built-in | Not built-in |
| **DB Integration** | Optional Drizzle-based `createModel` with auto-CRUD, pagination, transactions | None (bring your own) | None (bring your own) | None (bring your own) | TypeORM/Prisma/Sequelize integrations |
| **Client** | Zero-dep `@nilejs/client` with typed payloads, upload support, discovery methods | Built-in typed client (monorepo) | Apollo Client, urql, Relay | Eden treaty (typed) | No official client |
| **Runtime** | Bun + Node.js (via @hono/node-server) | Node.js, edge runtimes | Any (runtime-agnostic) | Bun only | Node.js (Express/Fastify) |
| **Maturity** | Early stage — core solid (auth, uploads, hooks, validation, client), WebSocket and streaming not yet implemented | Mature, widely adopted | Very mature, industry standard | Growing rapidly | Very mature, enterprise-proven |

---

## Nile's Unique Strengths

1. **AI-Agent Ready Without MCP** — The `explore` and `schema` intents make every Nile backend a complete tool interface for AI agents. An LLM can discover available actions, understand their input schemas, and invoke them — all through the same endpoint applications use. No MCP server, no adapter layer, no separate tool definitions. The structural similarity to MCP is no coincidence — both converged on named operations with typed inputs as the right abstraction — but Nile is a framework that builds the backend, not a protocol that talks to it.

2. **Radical Simplicity** — No decorators, no DI, no classes. An action is just `{ name, handler, validation }`. A service is just `{ name, actions[] }`. The learning curve is minimal — most developers are productive within an hour.

3. **Result Pattern Consistency** — The entire pipeline uses `Ok`/`Err` from top to bottom. `handleError` adds logged, traceable errors for runtime failures. `safeTry` catches uncaught exceptions. No exception-based control flow anywhere. Error paths are explicit and predictable from handler to client.

4. **Hook System** — Before/after hooks at global and per-action level, with `isCritical` flag controlling pipeline continuation. Hooks reference other registered actions by `service.action` address, enabling cross-service composition without coupling.

5. **Built-in Auth** — JWT authentication configured once at the server level, enforced per-action via `isProtected`. Custom authorization (RBAC, API keys) via `onBeforeActionHandler` hooks with access to verified identity. No separate auth middleware to wire up.

6. **Database Utilities** — `createModel` generates typed CRUD operations from Drizzle tables with auto-validation, cursor/offset pagination, and transaction variants out of the box. Database-agnostic for those who prefer other ORMs.

7. **Honest Trade-offs** — Nile is upfront about what it doesn't do: no HTTP verb semantics, no browser-level caching, no per-endpoint route matching. These are deliberate design decisions, not missing features. The framework targets dashboards, internal tools, business logic APIs, and AI integration — use cases where these trade-offs are strengths.

---

## Current Gaps

- **WebSocket/RPC transports** — placeholder types only, not yet implemented
- **Streaming** — no SSE, WebSocket, or chunked transfer support
- **Actions immutable after boot** — no dynamic registration of services/actions at runtime
- **Handler data** typed as `Record<string, unknown>` — requires manual casting inside handlers (Zod validates shape, but the handler signature doesn't reflect it)
- **No HTTP-level caching** — single POST endpoint means no ETags, Cache-Control, or CDN-friendly GET routes. Application-level caching required.
- **No read/write action distinction** — all actions go through POST regardless of intent. No GET-with-query-params path for read operations

---

## When to Choose What

| Scenario | Best Pick | Why |
|---|---|---|
| Full-stack TS monorepo, rapid iteration | **tRPC** | Unmatched type inference across client/server with zero codegen |
| Complex multi-consumer data APIs, federated graphs | **GraphQL** | Flexible queries, schema federation, mature ecosystem |
| Raw performance, edge/serverless, Bun-only | **Elysia** | Bun-native optimizations, fastest benchmarks |
| Enterprise microservices, structured teams | **NestJS** | Battle-tested patterns, comprehensive DI, proven at scale |
| Public APIs behind CDNs, HTTP caching required | **Elysia / NestJS** | Full HTTP verb semantics, GET routes for cacheable reads |
| AI-agent-ready APIs, functional simplicity | **Nile** | Built-in discovery + schema = complete tool interface without MCP |
| Dashboards, internal tools, business logic APIs | **Nile** | Action model maps naturally to business operations, minimal boilerplate |
| Small teams wanting minimal boilerplate + DB utilities | **Nile** | `createAction` -> `createService` -> done. Optional `createModel` for Drizzle CRUD |
| Separate frontend/backend repos with type safety | **Nile** | Schema-driven client types without monorepo coupling |

---

## Verdict

Nile is a **service-action framework** — not REST, not RPC, not trying to be either. It occupies a distinct niche: structured, discoverable backends built from named operations with typed inputs, where the same API surface serves both applications and AI agents without an adapter layer.

The core is solid: JWT auth, file uploads, Zod validation, hook pipelines, O(1) engine routing, Result pattern error handling, duplicate detection, cross-runtime support (Bun + Node), a zero-dep typed client with upload support, and built-in discovery via `explore`/`schema` intents. The 318-test suite covers the implementation thoroughly.

The honest gaps are WebSocket support and streaming — both planned but not implemented. The single-POST model means no HTTP-level caching, which rules Nile out for public CDN-cached APIs. Handler data typing (`Record<string, unknown>`) requires manual casting despite Zod validation.

The competitive positioning is clear:
- tRPC owns monorepo type inference. Nile offers type safety without the monorepo requirement.
- GraphQL owns complex data graphs. Nile targets operational APIs, not query-heavy data fetching.
- Elysia owns raw Bun performance. Nile's O(1) routing is fast but doesn't compete on benchmark territory.
- NestJS owns enterprise patterns. Nile trades OOP structure for functional simplicity.

Where Nile stands alone is the AI integration story. A Nile backend is a complete tool interface out of the box — discoverable, typed, invocable — without MCP, without OpenAPI generation, without any additional layer. As AI-agent integration becomes standard for backend services, this is a genuine structural advantage that the other frameworks would need bolted on.
