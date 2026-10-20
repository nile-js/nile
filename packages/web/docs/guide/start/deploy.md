# Deploy the application you built

Nile builds a request handler; your runtime starts and owns the listener. A long-running Bun or Node.js service is the straightforward deployment model.

## Choose the adapter explicitly

- **Bun native:** `runtime: "bun", native: true`, then `Bun.serve({ fetch: server.nativeRest.fetch, port })` after checking it exists.
- **Bun with Hono:** `runtime: "bun"`, omit `native`, then serve `server.rest.app.fetch`.
- **Node.js with Hono:** `runtime: "node"`, omit `native`, then pass `server.rest.app.fetch` to `serve` from `@hono/node-server`.

See [complete startup examples](/guide/start/runtime-adapters). Use a current supported runtime and verify it against your pinned Nile release and dependencies. The recorded performance run used Bun 1.4.2; this is measurement provenance, not a minimum-version guarantee.

## Prepare production configuration

Keep application settings in your own configuration module and supply them to the server. Before deployment:

1. Limit `allowedOrigins` to the frontends that need access. CORS is not authorization.
2. Configure authentication and enforce action-level access policies.
3. Leave discovery disabled unless you need it; protect enabled discovery with an appropriate secret and network policy.
4. Configure upload limits and static assets only where needed.
5. Supply a logger and decide where its files or output will live.
6. Select a rate-limit store appropriate to the number of running instances. An in-memory limit is per process.

Do not place production credentials in checked-in examples or browser bundles.

## Own the process lifecycle

Run the listener under your hosting platform, container supervisor or service manager. Set its host and port through application configuration, terminate TLS at your chosen boundary, and implement graceful shutdown for the listener and application-owned resources.

`enableStatus: true` adds `GET /status`. It reports that the application handler is running; it does not test database, queue or downstream availability. Add a readiness route for checks your deployment actually needs.

Nile prints startup service/action registration stats by default. `logServices: false` turns off that output; `server.stats()` returns the startup snapshot either way. Registration timing is not ongoing request latency or a full profiler.

## Keep persistence and scale decisions explicit

Nile does not require a database or run a schema migration for you. The CLI template's PGLite startup setup is an example application choice. Configure persistent storage, backups, migrations and transaction boundaries for your own data layer before production use.

For multiple instances, shared state, sessions, jobs and external resources need an application-level plan. The consistent service/action structure helps the team maintain a growing codebase; it is not automatic distributed infrastructure.

Serverless or edge deployment needs a separate compatibility and lifecycle review. Do not assume every Hono target works with Nile's filesystem, AsyncLocalStorage and application dependencies.
