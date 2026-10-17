# Nile framework benchmarks

This suite separates recorded Nile optimization evidence from new framework comparisons. The previous updates and before/after results were pushed as `9f5a173`. [Recorded medians and limits](../nile-old-vs-new.md), [raw evidence](evidence/nile-optimizations-2026-10-17/README.md), and the [deferred landing refresh](../landing-refresh-deferred.md) are committed. That historical comparison used a safe local baseline before optimization; it was not a published-release comparison.

## Current comparison scope

The isolated suite pins framework dependencies in `suite/package.json` and `suite/bun.lock`; Nile's runtime manifest and the root lockfile are unchanged by these benchmark installations. The owner approved those installs and native NestJS/AdonisJS class/decorator patterns solely for benchmark fixtures. Lifecycle installation scripts were disabled. Configuration uses explicit arguments and fixture files, with no application environment files or database services.

The Node track includes current Nile, published Nile 0.0.17, Elysia, Express, Fastify, NestJS on Express and Fastify, AdonisJS, Effect, and tRPC. The Bun track separately includes current/published Nile, Elysia, and native Effect. Common validated comparisons use equivalent Zod rules; these are not each framework's best possible native validation/serialization settings. Native Effect and Encore fixtures are also available for separate investigation. No winner or universal "fastest" claim is established by setup tests.

Encore has three real 300-endpoint apps, but requires an actual Encore compiler/runtime. Its official CLI downloads returned access errors here, and TypeScript checking encounters two upstream SDK declaration incompatibilities. It is explicitly excluded from automated measurement until native verification succeeds; see [Encore prerequisites](suite/encore/README.md). No substitute server is labelled Encore.

## Owner-run HTTP measurement

The agent has not started any listening server. Follow the [owner-run matrix instructions](suite/MATRIX.md); this single launcher starts fixtures, checks all 300 operations and invalid inputs, runs a separate external HTTP generator, and saves logs, startup/resources, raw trials and summaries. Production-quality runs take substantially longer than development checks. Node and Bun results stay separate.

Before invoking the launcher on a fresh checkout, install exact suite dependencies with Bun, build Nile, then compile the benchmark's native TypeScript fixtures:

```sh
cd packages/benchmarks/suite
bun install --frozen-lockfile --ignore-scripts
node build.mjs
```

Start the owner-run development matrix from `packages` with `NODE_ENV=production node benchmarks/suite/run-matrix.mjs --nile-revision 9f5a173`. The coordinator and fixture entry point require this standard runtime setting; no environment files are read or changed.

Framework listeners and their complete HTTP preflight remain unverified until the owner runs the launcher. Current non-listening checks cover the load generator's pure logic; all routes in current/released Nile, Fastify, tRPC, Elysia and Effect; Nest Fastify responses; and Nest Express/Adonis lifecycle and route registration. These checks do not replace the external HTTP run.

## Evidence and claims

Both modes register 300 real operations, rotate requests across them, and verify the returned operation identity and business result. The load generator records fully consumed response latency, successful requests/sec, errors, body bytes, and all five randomized repetitions. It uses closed-loop load and can share the machine with servers, so coordinated omission and client contention remain limitations. Request envelopes and host adapters differ; results describe complete configured stacks, not framework overhead alone.

Use exact versions, runtime, Nile revision/artifact hash, workload, concurrency, ranges and errors alongside any future claim. Compare architecture separately using implementation size, change effort, correctness and developer experience; throughput does not establish that one architecture is universally better.

[Version research and primary sources](research.md). [Implementation record and changed files](task.md).
