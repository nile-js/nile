# Framework benchmark integration research

Checked on 2026-10-17. Versions below were read from the public npm registry's `latest` endpoint, not inferred from examples. The suite must lock these exact versions; this document is a research snapshot, not a live version promise.

| Framework/package | Verified version | Native fixture |
| --- | --- | --- |
| [elysia](https://registry.npmjs.org/elysia/latest) | 1.4.30 | Bun native; Node with adapter below |
| [@elysia/node](https://registry.npmjs.org/@elysia%2fnode/latest) | 1.4.6 | Current documented Node adapter |
| [@nestjs/core](https://registry.npmjs.org/@nestjs%2fcore/latest) | 12.1.3 | Express and Fastify hosting tracks |
| [@nestjs/platform-express](https://registry.npmjs.org/@nestjs%2fplatform-express/latest) | 12.1.3 | Default Nest HTTP adapter |
| [@nestjs/platform-fastify](https://registry.npmjs.org/@nestjs%2fplatform-fastify/latest) | 12.1.3 | Recommended performance adapter |
| [express](https://registry.npmjs.org/express/latest) | 5.3.0 | Node HTTP, JSON parsing and JSON responses |
| [fastify](https://registry.npmjs.org/fastify/latest) | 5.12.7 | Native HTTP, await readiness before measurement |
| [@adonisjs/core](https://registry.npmjs.org/@adonisjs%2fcore/latest) | 7.6.0 | Full app lifecycle; Node >=24 |
| [effect](https://registry.npmjs.org/effect/latest) | 4.0.5 | `effect/http` router with runtime layer |
| [@effect/platform-node](https://registry.npmjs.org/@effect%2fplatform-node/latest) | 4.0.5 | Native Node HTTP server |
| [@effect/platform-bun](https://registry.npmjs.org/@effect%2fplatform-bun/latest) | 4.0.5 | Native Bun server, separate runtime track |
| [encore.dev](https://registry.npmjs.org/encore.dev/latest) | 1.58.6 | Real Encore compiler/Rust runtime |
| [@trpc/server](https://registry.npmjs.org/@trpc%2fserver/latest) | 11.19.0 | Standalone Node HTTP adapter |

[Encore CLI v1.58.6](https://github.com/encoredev/encore/releases/tag/v1.58.6) was published on 2026-10-01. Its GitHub release API listed no downloadable assets; do not invent an asset URL or checksum. The official installer URL returned HTTP 403 from this environment when inspected, so binary acquisition needs a verified alternative before Encore can be measured.

## Native setup and compatibility

- [Elysia Node setup](https://elysiajs.com/integrations/node): `new Elysia({ adapter: node() })`, importing `node` from `@elysia/node`. The older `@elysiajs/node` still exists at 1.4.5, but is not the current documented package.
- [Nest performance setup](https://docs.nestjs.com/techniques/performance): Express is the default; include a separately labelled Nest/Fastify fixture. Conventional controllers/modules require the user-approved class exception limited to framework fixtures.
- [Express API](https://expressjs.com/en/5x/api/): use its actual JSON parser and JSON response path. Do not bypass parsing with a fabricated handler.
- [Fastify validation](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/): native request validation uses Ajv; declared response schemas enable compiled serialization. Keep native validation/serialization in the recommended configuration track. A common-Zod track isolates validator differences.
- [Adonis installation](https://docs.adonisjs.com/installation) and [deployment](https://docs.adonisjs.com/deployment): current v7 requires Node >=24 and compiled production output. Run a complete application rather than measuring only a low-level router. Its boot/configuration must avoid reading existing environment files.
- [Effect router](https://effect.website/docs/v4/api/effect/http/HttpRouter): build `HttpRouter.addAll` once. `HttpRouter.toWebHandler` provides a non-listening correctness path and a resource-disposal function. Use [NodeHttpServer.layer](https://effect.website/docs/v4/api/platform-node/NodeHttpServer) for actual Node HTTP measurement, not the Fetch bridge. `HttpRouter.serve(..., { disableLogger: true })` disables request logging.
- Effect 4 moves HTTP modules to `effect/http`. The separately published `@effect/platform` latest 0.97.2 peers on **Effect ^3.22.2**, so it must not be combined with Effect 4.0.5. The runtime packages above peer on Effect ^4.0.5.
- [Encore API definitions](https://encore.dev/docs/ts/primitives/defining-apis), [raw APIs](https://encore.dev/docs/ts/primitives/raw-endpoints), and [validation](https://encore.dev/docs/ts/primitives/validation): real compiler-recognized, exported literal `api` or `api.raw` declarations are required. Native typed APIs parse and validate in Rust. Numeric Min/Max rules are native; integer safety additionally needs handler guards to match this suite's exact numeric contract.
- [Encore runtime architecture](https://encore.dev/blog/rust-runtime) and [self-host builds](https://encore.dev/docs/self-host/build): its Rust runtime handles routing, parsing, validation and serialization, with Node executing handlers. A handmade Node wrapper around the SDK is not Encore. Production builds use `encore build docker`; development `encore run` results must be explicitly labelled development results. No database, cloud login, or deployment is part of these database-free fixtures. CLI startup behavior and unlinked local-app support still require verification before a run.
- [tRPC adapters](https://trpc.io/docs/server/adapters) and [HTTP protocol](https://trpc.io/docs/rpc): standalone uses Node HTTP. POST mutations carry JSON inputs and responses wrap payloads in `{result:{data}}`. Batching must be off in the single-operation comparison; report batched operations separately.

## Fair comparison contract

Register 300 independent POST routes/actions/procedures. Each receives `{ id, value }`: id is a nonnegative safe integer; value is an integer from 0 through 999. Return `{ id, value: value + 1, action: routeIndex }`. Distribute requests deterministically across every route and verify route-specific output.

Separate plain JSON, common-Zod validation and recommended native-validation tracks. Native envelopes stay intact and are disclosed; record response bytes and operations/sec. Compare Node 24 configurations together, and Bun configurations separately. Encore's native multithreaded runtime must be disclosed rather than described as a pure JS comparison.

Use production listeners and a separate load generator, consistent request logging policy, warmup and randomized repetitions. Preserve failures and all repetitions. Record throughput, latency percentiles, CPU, RSS, startup and readiness. The user starts every listener. No blanket "fastest TypeScript framework" claim follows from a finite local matrix; publish the exact workload, environment and measured scope.

## Local evidence and fixture verification

The full public registry metadata, including package integrity fields and peer dependencies, is archived at [npm-latest.json](evidence/framework-metadata-2026-10-17/npm-latest.json). Encore's full strict TypeScript diagnostics are preserved at [encore-types.log](evidence/framework-metadata-2026-10-17/encore-types.log). Pinning Node types to 24.19.2 retains two upstream SDK cast errors, now because of `setKeepAlive` overload differences; no local fixture diagnostic was reported across all 36 Encore TypeScript source files.

The Effect fixture exposes native Node and Bun server-layer factories without executing them. Its non-listening Fetch correctness tests pass for every one of the 300 routes in each of plain, common-Zod and native Effect-schema modes, plus malformed JSON and numeric boundary cases (6 tests). Encore source/helper checks pass (5 tests), checking all 300 literal paths per app and raw parsing/validation helpers; this does not establish Encore compiler or runtime compatibility. Native Encore execution remains pending.
