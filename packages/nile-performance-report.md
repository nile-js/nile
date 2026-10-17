# Nile startup and request performance

## What the current design does

Nile registers services and actions once, with expected O(services + actions) startup work and storage. Dispatch resolves a service and action through keyed lookups, expected O(1); 300 registered actions do not require scanning 300 handlers per request. A single Hono POST endpoint handles action calls.

Requests still pay for JSON parsing, envelope and action validation, request scope, hooks, handler execution, Result wrapping, and response serialization. Middleware matching scans its registry per request. Wildcard schema discovery converts visible schemas and serializes the full result each time.

## Correctness finding before optimization

A deterministic overlap test reproduced shared mutable hook state and logs: request A observed B's hook state and before-hook log, even though both HTTP responses reported success. This historical baseline fails hook isolation; the final build passes the same reproduction. Stateless echo throughput does not establish safety for stateful hooks.

The user approved isolating per-execution state and logs using existing asynchronous scope, including direct and nested execution. Global hook callbacks, configuration, and execution order remain unchanged. All four isolation regressions and the full core/client suites pass. The original overlap reproduction against fresh built output now passes, and paired benchmarks are complete. Outside execution, `hookContext` resolves to a context-local fallback rather than a completed request. Completed execution logs should be read from the returned pipeline payload when `result.pipeline` is enabled. Other performance optimizations remain proposals.

## Source QA and build status

All 351 core tests across 19 files pass: 338 existing tests, nine new statistics tests, and four concurrency regressions. All 26 client tests pass. The concurrency regressions cover overlapping HTTP and direct executions, isolated errors, nested executions, inherited session and REST/WebSocket/RPC references, and preserved global before/after hook order. The new concurrency test file remains below the 400-line limit at 398 lines.

Source type checking and targeted lint pass. Full TypeScript 7 checking still reports the same nine existing test-fixture diagnostic locations and codes, with no new diagnostics; it is not a clean full-project type check. A fresh ESM/CommonJS JavaScript, declaration, and source-map build passes.

Strict TypeScript 7 NodeNext and Bundler consumers of the fresh build pass, including public statistics types and negative assignments. Node ESM/CommonJS statistics runtime checks pass. The original controlled overlap now keeps A and B state and logs separate. A second test suspends all 300 overlapping HTTP calls across 300 primary actions plus two helper actions; every response preserves its own hook state, action name, REST identity, session, global/action hook order, and before/after input/output log ownership. Paired benchmarks are complete; their results below measure combined changes without claiming a speedup. The fix avoids duplicate context allocation; broader performance proposals remain unimplemented.

## Measurement method

Bun 1.4.2 on Linux x64, Intel Core i5-6300U at 2.40 GHz, four logical CPUs, and 15.50 GiB physical memory. Tested the pre-change built Nile package with Slang 0.0.9 and Zod 4.6.7. Fixtures use public synthetic actions with diagnostics, rate limiting, and static serving disabled.

No socket is bound. HTTP cases call Hono `app.request`, including fresh request-body generation and response JSON consumption. Engine cases bypass HTTP. All calls run in one process; bounded concurrency means overlapping work, not parallel CPU execution.

The baseline contains 36 cases, 108 measured trials, and 198,180 measured requests. Each case has three trials, normally 300 warmup requests. Engine trials measure 3,000 requests, primary HTTP trials 1,500, and feature trials 1,200. Schema discovery uses three warmups and 30 measured requests per trial. Every measured echo response matches its input identifier; discovery counts also match. Those checks exclude the separate failing hook-isolation test.

## Selected baseline results

Numbers are median trial throughput and median trial p95 latency. Short fixed-order trials are noisy; differences do not prove a causal speed gain.

| In-process workload | Concurrent requests | Requests/second | p95 latency |
|---|---:|---:|---:|
| Direct engine, 300 registered actions | 1 | 104,846 | 0.014 ms |
| HTTP action, 300 registered actions | 1 | 10,370 | 0.140 ms |
| HTTP action, 300 registered actions | 30 | 21,199 | 2.595 ms |
| HTTP action, 300 registered actions | 100 | 23,498 | 6.914 ms |
| HTTP action, 300 registered actions | 300 | 16,398 | 22.653 ms |
| HTTP action, 30 services with 10 actions each | 100 | 12,376 | 14.357 ms |
| HTTP action, 50 middleware registrations | 100 | 7,882 | 18.286 ms |
| Wildcard discovery, 300 action schemas | 1 | 145 | 10.833 ms |
| Wildcard discovery, 300 action schemas | 30 | 130 | 230.652 ms |

The middleware API currently caps registrations at 50, so the supported limit was measured. The four-hook case elsewhere in the raw report has 304 actions: 300 echo actions plus four helper hook actions. Hook helpers in that throughput case are stateless.

Factory initialization excludes imports, fixture/schema construction, external resources, process startup, and listening sockets. After one warmup, each topology measures 50 factory calls, including engine indexing and REST/middleware setup. For 300 actions in one service, p50 is 0.446 ms and p95 1.300 ms; spread over 30 services, p50 is 0.362 ms and p95 1.055 ms. These timings precede the new statistics feature and do not measure module loading.

## Priorities to investigate

1. **Retain correctness isolation.** Overlapping HTTP, direct, and nested execution checks now pass. Preserve execution scope during future optimization, including actions without declared hooks: handlers and global `getContext()` can still access hook state.
2. **Avoid repeating schema conversion.** Wildcard schema discovery is much more expensive than ordinary action execution. Consider caching immutable schema conversion results, while applying visibility and authorization for each request. A blind global cache of authorization-sensitive responses is unsuitable. This targets discovery-heavy workloads, not ordinary action execution.
3. **Measure empty pipeline phases.** Actions without hooks may benefit from skipping unused phases and their allocations. Profile first and preserve validation, errors, and hook ordering.
4. **Measure middleware matching.** The supported 50-registration case shows overhead at concurrency 100. Investigate indexed matching or a no-middleware fast path without changing dynamic registration or execution order.
5. **Measure response size and JSON cost.** Compare realistic payload sizes and large discovery responses before proposing serialization changes. The current echo responses are small.

No speedup is claimed for these proposals. Only the approved statistics feature and hook-isolation correctness fix are implemented. The paired comparison below measures both changes together; longer randomized trials are still needed before attributing differences to a specific cause.

## Limits and evidence

These observations exclude TCP/TLS, proxies, socket limits, network transfer, database latency, external APIs, production authentication, and production logging. They are local framework-overhead measurements, not production capacity promises. No sustained soak, open-loop overload, request-abort, fairness, multi-worker, or recovery test was performed.

JIT warmup, garbage collection, CPU frequency, and other machine activity confound cross-case comparisons. Heap deltas without forced collection do not prove per-request memory cost or leaks. The 10 ms event-loop monitor produces too few samples in these short runs for meaningful p99 claims.

Preserved baseline: `/home/kizz/CODE/new-nile/backup/startup-stats-performance-2026-10-16/performance-baseline/`, containing `report.md`, `benchmark.json`, `benchmark.mjs`, `benchmark.log`, `repro.mjs`, and `concurrency-repro.json`. The scripts import the built Nile artifact directly; rebuilding changes what a later run measures. Original temporary evidence is at `/tmp/nile-performance-2026-10-16/`.

## Final paired comparison


Runtime: Bun 1.4.2; CPU: Intel(R) Core(TM) i5-6300U CPU @ 2.40GHz, 4 logical CPUs.

Baseline is the original built artifact preserved before startup stats/isolation changes. Final is the fresh built artifact with both changes. Both resolve the same installed dependencies, including Slang 0.0.9 and Zod 4.6.7. SHA-256 hashes and exact artifact paths are recorded in paired.json. Five trials per version/case alternate baseline/final order. Each version warms 1500 requests. Each engine trial runs 10,000 requests; each in-process HTTP trial runs 3000. All measured responses validate their own id.

No TCP/TLS, database, external I/O, real authentication, production logging or multi-worker deployment is included. One-process Promise concurrency is not CPU parallelism. This is short exploratory measurement: JIT, GC, CPU frequency and other system activity still matter. Differences cannot separately attribute startup stats versus per-action isolation because both are in the final artifact. Startup stats add no steady-request counter instrumentation; per-action scope isolation adds actual work.

## 300-action dispatch comparison

| Path | Concurrency | Baseline median req/s | Final median req/s | Change | Baseline p95 ms | Final p95 ms | Final trial range req/s |
|---|---:|---:|---:|---:|---:|---:|---:|
| engine | 1 | 110,851 | 102,944 | -7.1% | 0.013 | 0.015 | 80,224–121,238 |
| engine | 30 | 109,929 | 86,588 | -21.2% | 0.429 | 0.424 | 60,312–117,737 |
| engine | 100 | 104,595 | 97,116 | -7.2% | 2.404 | 2.696 | 68,697–114,858 |
| engine | 300 | 83,743 | 68,232 | -18.5% | 6.685 | 8.482 | 60,843–102,141 |
| http | 1 | 16,948 | 17,463 | +3.0% | 0.103 | 0.104 | 15,206–17,992 |
| http | 30 | 18,702 | 18,588 | -0.6% | 3.561 | 3.304 | 15,272–23,519 |
| http | 100 | 12,934 | 12,720 | -1.7% | 14.189 | 16.455 | 9,106–20,058 |
| http | 300 | 15,086 | 13,104 | -13.1% | 28.723 | 38.659 | 10,413–19,127 |

520,000 measured requests across eight paired scenarios and 80 individual trials; 0 request errors and 0 echo mismatches. Warmup requests are additional.

Final engine medians are about 7–21% below the baseline in these samples. Final in-process HTTP medians range from about +3% to −13%, with the largest decline at concurrency 300. The correctness fix has measurable cost; a high throughput result from the unsafe shared-hook baseline is not a correctness target. These measurements do not justify production capacity promises.

## Repeated startup wiring

Services and schemas are constructed before timing; imports, process startup and listening sockets are excluded. Each pair measures 50 public factory calls; the table reports the median of five trial medians. Final native registration measurements are also retained in JSON; the old artifact does not expose that internal measurement.

| Topology | Baseline factory ms | Final factory ms | Difference ms |
|---|---:|---:|---:|
| 1 service(s), 300 actions | 0.100 | 0.146 | +0.046 |
| 30 service(s), 300 actions | 0.161 | 0.170 | +0.008 |
| 1 service(s), 3000 actions | 1.274 | 1.049 | -0.225 |

Factory differences are small and variable. The apparent 3000-action speedup should be treated as measurement noise, not a proven optimization. The structural conclusions remain: startup registration/storage scale with action count, while dispatch uses keyed lookup rather than scanning all registered actions.

## Final preservation and conclusion

The logger fixture is restored byte-identically. Original baseline failures remain preserved as historical evidence rather than overwritten. Final overlap, load, and paired benchmark evidence is preserved under `/home/kizz/CODE/new-nile/backup/startup-stats-performance-2026-10-16/performance-final/`; consumer and suite evidence is in the sibling `verification/` directory. See [task.md](task.md) for changed files and closure.

The feature and approved correctness fix are verified. Direct engine medians are lower in these samples, and HTTP results vary with concurrency; this work does not establish a speed gain. Full-project checking still has nine known fixture diagnostics, unchanged in location and code. No additional performance proposal, version bump, commit, or publication is included.
