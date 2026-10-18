# Nile framework benchmarks

**Latest completed results:** [18 October comparison](completed-comparison-2026-10-18.md). The long sequence is stopped and development processes restored. Node corrected scenarios and the full Bun primary matrix completed. Dedicated Hono/bare Bun controls and FULL durability were not completed; no automatic continuation is scheduled.

The current benchmark uses Nile's local production build. Published/old Nile has been removed from fixture launchers and the isolated dependency lock. Historical optimization measurements remain available in [the Nile report](../nile-old-vs-new.md); they are separate evidence and are not rerun by the current comparison. The [landing refresh](../landing-refresh-deferred.md) remains deferred.

## Current scope

The owner approved isolated pinned dependencies, native NestJS/AdonisJS fixture patterns, necessary benchmark servers and fresh isolated database workloads. Application environment files and databases are never used. Nile runtime dependencies and the root lockfile are unaffected by suite installations.

The Node comparison covers current Nile, Elysia, Express, Fastify, NestJS with Express and Fastify, AdonisJS, Effect, tRPC and actual production Encore. The Bun track separately covers current Nile, Elysia and native Effect. Targeted component comparisons add plain Hono and bare Bun. Common validation uses equivalent Zod rules; these fixtures do not claim each framework's best possible native tuning.

Encore's official pinned CLI was obtained and verified. Real production Docker images compile successfully using Node 24.16.0. Earlier SDK TypeScript diagnostics remain recorded as upstream research evidence; actual native compilation is the relevant build check. See [Encore setup](suite/encore/README.md).

## Measurement

The revised protocol issues **1,000,000 measured requests per framework**, divided exactly across six workload cells and three repeats: memory reads, SQLite reads, and SQLite read/write transactions, each with action validation off/on. Warmups and correctness probes are additional. The report shows arithmetic means and ranges, retains failures, and validates every response. Node/Bun tracks record separate native SQLite driver versions.

Only one framework server runs at a time. A quiet-host gate checks aggregate and selected CPU idle time, memory and swap before each cell. Server and generator use different physical CPU cores; background samples remain in evidence. The owner's approved development processes are paused only for the measurement window and restored afterward. Closed-loop load and a shared desktop machine remain limitations.

Follow [matrix instructions](suite/MATRIX.md), [workload details](suite/shared/WORKLOADS.md), and [the protocol plan](count-protocol-plan.md). Preliminary short-duration results in [the exploratory report](http-comparison-2026-10-17.md) predate this revised protocol and cannot substitute for its results. Setup tests alone do not establish a fastest-framework claim.

## Preparation

```sh
cd packages/benchmarks/suite
bun install --frozen-lockfile --ignore-scripts
node build.mjs
```

Build Nile first using its normal package build. The coordinator captures the exact artifact SHA256, current source revision, dependency lock and runtime versions. See [implementation record](task.md) and [version research](research.md).
