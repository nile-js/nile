---
title: "Deployment"
description: "Build, check readiness and shut down a Nile application"
---

Nile builds a request handler, and your runtime starts the listener. Deploy it as a long-running Bun or Node.js service.

## Choose the adapter explicitly

- **Bun native:** `runtime: "bun", native: true`, then `Bun.serve({ fetch: server.nativeRest.fetch, port })` after checking it exists.
- **Bun with Hono:** `runtime: "bun"`, omit `native`, then serve `server.rest.app.fetch`.
- **Node.js with Hono:** `runtime: "node"`, omit `native`, then pass `server.rest.app.fetch` to `serve` from `@hono/node-server`.
- **Sockets:** on Bun, serve `server.fetch` and spread `server.socket.bun` into `Bun.serve`. On Node.js, call `server.socket.attachNode(httpServer)`.

See [complete startup examples](/guide/start/runtime-adapters). Pin your runtime version and test it with your Nile release and dependencies. The [performance run](/guide/reference/performance) used Bun 1.4.2.

## Keep the runtime patched

A Nile Js server runs inside your Bun or Node.js process, so every runtime security release applies to it. When one ships, update the runtime, rebuild your container images and restart every process.

- **Node.js:** the October 21, 2026 security release fixed ten vulnerabilities. They include a high-severity Brotli decoder flaw that permits remote code execution, two TLS certificate hostname bypasses and a `dns.resolve` NUL truncation issue. Run at least 22.23.4, 24.22.1 or 26.12.1. `@nilejs/nile` declares these versions in its `engines` field, so npm warns when you install it on an older Node.js. Node.js 20 and older are end-of-life and receive no fixes.
- **Bun:** follow Bun's releases and upgrade with `bun upgrade`. The CLI starter's Dockerfile uses `oven/bun:1-alpine`, so rebuilding the image picks up the newest Bun 1.x release.
- **Decompression:** Nile Js does not decompress request bodies. If you add decompression middleware, or your code calls `fetch` on servers you do not control, compressed data from outside is decoded inside your process. Keep the runtime patched and keep request size limits in place.

Check the running version with `node -v` or `bun -v`, in the same image or host that serves production traffic.

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

Run the listener under your hosting platform, container supervisor or service manager. Set its host and port through application configuration, terminate TLS at your proxy or load balancer, and shut down the listener and your own resources gracefully.

`rest.enableStatus: true` adds `GET /status` and `GET /ready` at the root of the server, outside your API prefix. Readiness follows Nile’s lifecycle state. Register application-owned resources with `server.lifecycle`, and connect the deployment shutdown signal to `server.lifecycle.shutdown()` before closing the listener. See [lifecycle and shutdown](/guide/reference/operations#deploy-and-shut-down-predictably).

Nile prints service and action registration stats at startup. `logServices: false` turns off the output; `server.stats()` returns the startup snapshot either way. The timings cover registration, not request latency.

## Keep persistence and scale decisions explicit

Your application owns its database. The CLI template's PGlite setup is one choice; configure persistent storage, backups, migrations and transactions for your own data layer before production.

Each Nile instance keeps its own queues, schedules, rate-limit counters, sessions and socket subscriptions. Running several instances needs shared stores or a message bus you provide.

Nile uses the filesystem and AsyncLocalStorage, so review serverless and edge targets for both before you deploy there. Nile supports Bun and Node.js.
