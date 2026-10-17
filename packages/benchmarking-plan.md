# Nile cross-framework benchmark plan

Date: October 17, 2026. Status: protocol prepared; external measurements pending.

## Objective and scope

Measure Nile against Elysia, NestJS, Express, Fastify, AdonisJS, Effect, Encore and tRPC using reproducible, equivalent application work. Include the current Nile build, the safe pre-optimization Nile artifact and an explicitly pinned released Nile package where its compatibility and correctness permit a meaningful comparison.

The goal is to learn where Nile leads, where it loses and which costs matter for a 300-operation application. The ambition to become the fastest TypeScript framework is a research goal. No winner is assumed and no universal ranking follows from one workload.

Application architecture needs separate evidence: implementation effort, type inference, module boundaries, change impact, error handling, discoverability and maintenance. Throughput cannot establish architectural superiority.

## Preconditions

1. Inspect existing benchmark tooling and preserve any existing file before editing it. Keep fixtures separate from production source and avoid database integration in the first comparison.
2. Resolve official framework documentation, package identities, supported runtimes and adapters. Pin exact framework, adapter, validation, load-generator and runtime versions in a manifest and lockfile. Record publication dates and artifact hashes where available.
3. Obtain approval before installing benchmark dependencies or introducing framework tooling. Record package security findings and unresolved risks. Do not silently substitute a prerelease or a similarly named package.
4. The owner starts all listening servers. Prepare concrete startup instructions and health checks first; wait for the owner to start them before external load begins. Do not read environment files or run database commands.
5. Preserve exact Nile source/build hashes before the approved commit, then record its commit identifier after the parent task commits. Keep a reproducible benchmark commit and raw output with the results.

## Framework matrix

| Target | Required comparison identity |
| --- | --- |
| Nile | Current built package, safe pre-optimization artifact, and separately pinned published release |
| Elysia | Official supported Node adapter for the Node track if available; native Bun in a separate track |
| NestJS | Explicit Express and Fastify adapters, reported separately |
| Express | Production HTTP server with explicit parsing and validation setup |
| Fastify | Production HTTP server with explicit serialization and validation setup |
| AdonisJS | Standard production application build and lifecycle; no database service required |
| Effect | A concrete official HTTP server stack and platform adapter, with its layers specified |
| Encore | A concrete TypeScript service and supported local production-serving mode; record generated runtime/toolchain |
| tRPC | A concrete production HTTP adapter, one procedure per operation, batching disabled for the single-call track |

Exact versions remain pending verified package research and installation approval. Unsupported runtime/framework combinations are marked unavailable with a reason. Effect and tRPC are building blocks with explicit adapters; Encore includes its own runtime/toolchain. Their measured configurations must appear beside their names.

## Equal-work contract

- Register 300 distinct operations in both one-domain and 30-domain-by-10-operation layouts. Dispatch across the full set with a seeded sequence. Include a one-operation control to expose scaling costs.
- Use HTTP POST with the same logical input, deterministic transformation and output data. For Nile and procedure protocols, document mandatory request and response envelopes and their byte sizes. Do not conceal their transport overhead or add synthetic overhead to other frameworks to force byte equality.
- Measure small JSON echo/transformation, validated JSON, invalid input, and configured request-context plus before/after behavior. Keep authentication cryptography as a separately defined workload with identical verification work.
- Separate a normalized shared-validator track from a native recommended-validation track. Document equivalent accepted/rejected inputs and transformation behavior. A validator-free case is labeled explicitly.
- Validate response status, payload identifier, transformed fields and error semantics. Include controlled overlapping and nested request-context checks before load. A fast adapter returning incorrect or cross-request data is ineligible for ranking.
- Disable application logging consistently for the overhead track; measure an explicitly matched logging track separately if needed. Align compression, connection reuse, body limits, response payload size and production mode.
- Measure Nile discovery separately. Other targets need equivalent discovery behavior before receiving a discovery comparison, rather than an empty handler competing against schema conversion.

## Runtime and load design

Node is the primary matched-runtime track, using the same exact Node release and one worker per server. Bun results form a separate track with one exact Bun release. Do not compare Nile on Bun against a competitor on Node as framework-only evidence. Report native Encore runtime constraints explicitly rather than pretending it shares a runtime configuration.

Use a separate external HTTP load-generator process. Record hardware, operating system, CPU governor/frequency observations, available memory, runtime flags, adapters and build commands. Prefer a dedicated load machine; if client and server share a host, record CPU allocation and demonstrate the client is not the limiting resource.

For every eligible framework/workload/runtime cell:

1. Build once in production mode, verify correctness and record artifact identity.
2. Start a fresh server process through the owner-controlled startup workflow. Measure process start to readiness and registration time separately where exposed.
3. Warm for a fixed documented period. Run at least five randomized rounds, using a saved seed and the same schedule per target.
4. Measure sustained external traffic at concurrency 1, 30, 100 and 300. Start with 30-second measurement windows and increase them if variance remains high. Preserve every trial, including failures and outliers, with an explanation for any invalid run.
5. Add an open-loop offered-load sweep to locate stable capacity, tail latency and overload behavior. Record timeouts, queueing, rejection and recovery instead of reporting successful throughput alone.
6. Repeat startup across fresh processes and measure idle, steady and peak resident memory. Measure a sustained soak after initial comparisons, with request cancellation and recovery checks.

Run one measured server at a time. Avoid compilation, tests and unrelated CPU-heavy jobs during measurement. Do not run a full matrix prematurely: pilot correctness and load-generator capacity, then freeze the protocol and execute the agreed matrix.

## Results and publication

Report throughput, p50/p95/p99 latency, request/response bytes, errors, timeouts, resident memory and fresh-process startup. Include per-trial ranges, raw latency histograms and uncertainty estimates where supported. Distinguish client end-to-end latency from internal handler timings. Do not average latency percentiles across trials as a combined percentile.

Publish the exact fixture source, pinned versions, commands, machine details, run order, seed, raw outputs and reproducible summary script. Separate internal Nile gains from cross-framework comparisons. Link each landing-page claim to a specific reproducible result and its runtime/workload conditions.

The initial [Nile before/after record](nile-old-vs-new.md) is complete for its stated in-process scope. Cross-framework results, released-Nile results and production capacity remain unmeasured. The [landing refresh brief](landing-refresh-deferred.md) is deferred until evidence is reviewed.

## Review criteria

Correctness and equivalent work come first. Investigate regressions, runtime differences, unexpected result shapes and client bottlenecks before interpreting rankings. Preserve negative outcomes. Prefer a narrower defensible claim over an unsupported universal speed claim.

Reflection: the previous paired runs exposed both a correctness cost and measurement variance. External HTTP, pinned artifacts, isolated rounds and retained raw trials address those limitations without changing the meaning of the historical evidence.
