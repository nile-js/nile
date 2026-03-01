# Roadmap

A timeline-based overview of where Nile is heading. Items move between tiers as priorities shift.

---

## Near-term

Features actively in progress or next in the queue.

- **File Uploads** — Multipart form-data parsing with 7-step validation chain, configurable limits, MIME/extension allowlists. Flat and structured parsing modes. *(implemented, testing complete)*
- **JWT Authentication** — Built-in JWT verification via `hono/jwt`. `isProtected` flag on actions, token extraction from header/cookie, claims mapping to `context.getAuth()` / `context.getUser()`. *(implemented, testing complete)*
- **WebSocket Transport** — Real-time bidirectional communication using the same service/action model. Subscribe to action results, push notifications.
- **Streaming Responses** — SSE and chunked transfer for long-running actions (AI completions, large dataset exports).
- **Performance Benchmarks** — Formal benchmark suite measuring O(1) action dispatch, throughput comparisons against endpoint-based frameworks (Express, Fastify, NestJS), and Bun vs Node runtime performance across real-world workloads.

## Mid-term

Planned features with clear design direction but not yet started.

- **Per-request Context** — Request-scoped `NileContext` instead of server-level singleton, enabling safe concurrent request handling with isolated state.
- **Action Middleware Chain** — Composable middleware functions per action (rate limiting, caching, logging) beyond the current before/after hook system.
- **Static File Serving** — Cross-runtime support is implemented (Bun and Node). Deno adapter planned.
- **CLI Enhancements** — `nile generate` for client SDK regeneration, `nile inspect` for action/schema introspection from the terminal.
- **Plugin System** — First-party plugins for common patterns: auth providers, file storage adapters, cache layers.
- **Error Standardization** — Structured error codes and categories across all error paths for consistent client-side handling.

## Future

Longer-term vision items under consideration.

- **Federated Services** — Compose multiple Nile servers into a unified API surface with cross-service action references.
- **Dynamic Action Registration** — Hot-load actions at runtime without server restart (currently immutable after boot).
- **Edge Runtime Support** — Cloudflare Workers, Vercel Edge, Deno Deploy adapters.
- **GraphQL Adapter** — Optional GraphQL interface layer on top of the service/action model.
- **Observability** — Built-in tracing (OpenTelemetry), metrics export, and structured logging integration.
- **Database Migrations** — Drizzle migration helpers integrated with `createModel` for zero-config schema evolution.

---

*This roadmap reflects current priorities and may change. For the latest status, check the repository issues and discussions.*
