# Nile HTTP comparison — 17 October 2026

Status: current local Nile versus other frameworks, using completed Node and Bun development matrices; controlled current-only and native Encore results pending. These are short local checks, not publication evidence. Nile did not have the highest median throughput in either matrix. The measurements do not establish a universal fastest TypeScript framework or an architecture advantage.

## What was measured

Each fixture registered 300 independent operations. Clients rotated across them, sent JSON containing an integer ID and value, and checked the incremented value and selected action identity in every response. Plain mode omits business input validation; validated mode applies equivalent Zod 4.6.7 rules. Native Effect/Encore validation investigations are separate from this common-Zod track. Native schema compilation and serialization optimizations were not enabled uniformly, so this is a comparison of the configured stacks.

All rows used concurrency 100, five randomized rounds, a one-second warmup before each two-second measurement, HTTP/1.1 keepalive and a separate Node HTTP generator process. One request is outstanding per worker. Response bodies are fully consumed, parsed and checked. Elapsed throughput includes draining in-flight requests. Server and client run on the same Linux x64 machine: Intel Core i5-6300U, four reported logical CPUs, approximately 16.64 GB RAM. This is closed-loop load, with coordinated omission and shared-machine/client contention limitations. No database, external network service, authentication workload or application-scale business work is represented.

The profile label **development** describes short benchmark durations. All server readiness records, manifest records and suite configuration report the actual runtime setting **production**. Node fixtures used Node 24.16.0; Bun fixtures used Bun 1.4.2. The coordinator and load generator used Node 24.16.0 on both tracks. Node and Bun results must remain separate.

Current local Nile used source revision label `9f5a173` and the current built artifact. Its package manifest still reports version 0.0.17; the source label and artifact hash identify the tested local build.

Scope change: the owner subsequently directed all benchmark checks to use **current local Nile only**. The initial completed raw matrices also contained an old published-Nile fixture before that instruction. Those raw records remain unchanged for provenance, but its rows are excluded from the comparison tables and current-scope counts below. No further old-Nile checks or comparisons are requested. The earlier [old-versus-new optimization record](../nile-old-vs-new.md) remains a separate historical deliverable.
## Correctness and evidence audit

- Both historical suites and all four mode generators finished and report valid results. The current-scope subset contains 120 measured trials, all with complete 300-action coverage and zero failed requests, timeouts, network errors, non-200 responses or payload mismatches. Its 120 warmup trials also passed.
- Excluding the historical old-Nile rows, Node measured 619,940 requests and Bun 282,171: 902,111 current-scope measured requests. Warmup and preflight requests are excluded.
- Every framework/mode preflight checked all 300 actions. Every validated fixture additionally rejected 30 invalid inputs: ten malformed payloads at actions 0, 149 and 299. Across the current-scope fixtures this is 7,200 valid-action preflight checks and 360 invalid-input checks. Nile rejection may be HTTP 200 with its native failure envelope; other fixtures use their native HTTP/client protocol semantics.
- All four saved manifest files match their recorded SHA-256 hashes. Both suite records capture the same lockfile hash and current Nile artifact hash, and both hashes were independently matched against the local files during this audit. This confirms artifact identity; the revision is a launcher-supplied label, not independently proven by Git during this audit.
- The suite records pinned dependency declarations, readiness and lifetime resource snapshots, fixture stdout/stderr and every trial. CPU/memory snapshots include initialization and preflight, so they are not per-request allocation or per-trial CPU measurements.

Current Nile artifact SHA-256: `24024c1ad52d1a36c7730ae8d446845fd7c4b6142f842c96c208490d07f5038a`. Suite lock SHA-256: `2e7d42413283f47ebe2d935f6d77c69dc720fd53d13c5db1f70f49175ef05855`.

## Current local Nile observations

Current Nile's Node medians were 1,558.07 req/s plain and 2,607.83 req/s with common Zod validation. Its Bun medians were 4,500.23 and 4,674.23 req/s respectively. Several other configured stacks had higher medians in these short runs. Wide ranges and shared-host effects make small differences unreliable; this is initial evidence to guide longer controlled measurements, not a public ranking.

The next controlled Node repeat uses current Nile, Fastify and native Encore in plain and typed modes. Its results are pending and must retain their own transport/validation descriptions rather than being silently combined with the common-Zod tables below.

## Complete Node results

Versions: Elysia 1.4.30 with @elysia/node 1.4.6; Express 5.3.0; Fastify 5.12.7; NestJS 12.1.3 on each named adapter; AdonisJS 7.6.0; Effect/platform-node 4.0.5; tRPC 11.19.0. Rows retain manifest order. All rows contain five valid trials and zero failures.

### plain

| Fixture | Successful req/s median [min–max] | Median trial p95 ms | Failed requests |
| --- | ---: | ---: | ---: |
| nile | 1,558.07 [675.25–2,622.37] | 127.10 | 0 |
| elysia | 2,592.60 [1,443.41–5,309.79] | 84.20 | 0 |
| express | 2,626.31 [1,432.09–3,598.10] | 68.50 | 0 |
| fastify | 4,795.71 [3,598.24–5,382.71] | 33.30 | 0 |
| trpc | 970.11 [743.11–1,697.42] | 177.00 | 0 |
| nest-express | 2,617.31 [1,749.64–2,960.25] | 63.90 | 0 |
| nest-fastify | 4,077.74 [2,645.27–5,535.87] | 49.40 | 0 |
| adonis | 3,797.46 [2,007.33–4,976.43] | 42.30 | 0 |
| effect | 4,521.79 [3,246.42–5,247.25] | 34.40 | 0 |

### validated

| Fixture | Successful req/s median [min–max] | Median trial p95 ms | Failed requests |
| --- | ---: | ---: | ---: |
| nile | 2,607.83 [1,068.93–3,202.35] | 73.10 | 0 |
| elysia | 5,651.11 [2,975.29–6,081.88] | 28.60 | 0 |
| express | 2,774.29 [2,461.94–3,792.55] | 58.60 | 0 |
| fastify | 5,031.00 [4,274.15–5,490.12] | 30.00 | 0 |
| trpc | 1,068.71 [859.27–1,407.71] | 124.10 | 0 |
| nest-express | 2,513.77 [2,076.51–3,199.58] | 58.60 | 0 |
| nest-fastify | 5,272.08 [3,875.15–5,783.57] | 29.80 | 0 |
| adonis | 4,784.87 [3,917.04–5,510.30] | 34.50 | 0 |
| effect | 5,284.41 [4,613.40–5,586.75] | 28.30 | 0 |

## Complete Bun results

The current-scope Bun fixtures cover current local Nile, Elysia 1.4.30 and Effect/platform-bun 4.0.5. Express, Fastify, NestJS, AdonisJS and tRPC were not included in this Bun launcher; their absence is not a failure result.

### plain

| Fixture | Successful req/s median [min–max] | Median trial p95 ms | Failed requests |
| --- | ---: | ---: | ---: |
| nile | 4,500.23 [3,558.74–4,958.38] | 36.20 | 0 |
| elysia | 5,237.90 [4,496.06–5,445.63] | 24.40 | 0 |
| effect | 4,566.29 [2,923.96–5,032.60] | 38.60 | 0 |

### validated

| Fixture | Successful req/s median [min–max] | Median trial p95 ms | Failed requests |
| --- | ---: | ---: | ---: |
| nile | 4,674.23 [3,338.05–4,902.10] | 30.50 | 0 |
| elysia | 5,218.74 [5,115.79–5,510.34] | 23.90 | 0 |
| effect | 5,005.48 [3,392.25–5,051.12] | 24.60 | 0 |

## Protocol differences and interpretation

Nile sends an execute-intent envelope to a single service endpoint and returns its native result envelope; other fixtures route directly to one of 300 operation paths. tRPC retains its standalone mutation protocol and result envelope. The business calculation is equivalent, but wire protocols and framework responsibilities differ. Nile currently performs additional public pipeline work, including request scope and native result handling. This run does not determine the isolated cost of each component.

Measured application body sizes varied slightly with sequence-number length: Nile averaged approximately 93 request bytes and 105 response bytes per operation; ordinary JSON fixtures approximately 23 and 35; tRPC approximately 22 and 55. HTTP headers, TCP and TLS bytes are excluded. Thus these numbers compare usable configured stacks with their actual protocol envelopes, not equal byte traffic or router cost alone.

The highest Node plain median was Fastify (4,795.71 req/s); the highest Node common-Zod median was Elysia (5,651.11 req/s). Elysia had the highest median in both Bun modes (5,237.90 and 5,218.74 req/s). These are observations within this run. Node Elysia's validated median was much higher than its plain median despite extra validation work; this is a useful warning about the noise and temporal effects in short trials, not evidence that validation makes requests faster. Current Node Nile plain ranged from 675.25 to 2,622.37 req/s. Such variance prevents a reliable ranking or confident small-percentage claim. p95 values are medians of trial percentiles in 0.1 ms histogram buckets, not a pooled p95 across all requests.

Throughput cannot establish maintainability, architectural quality, implementation effort or how well a real 300-action application behaves with its own I/O and domain logic. The deferred [landing refresh](../landing-refresh-deferred.md) must not claim Nile is the fastest TypeScript framework using these checks.

## Encore status

Native Encore is pending at this draft's creation. The completed Node/Bun manifests retain their historical Encore exclusion; do not rewrite those raw records to imply Encore participated. A real native build/runtime check is in progress separately. Any forthcoming Docker-hosted Encore result must identify image/compiler/runtime versions, native validation semantics, container networking and resource limits. Its container transport differs from these loopback host processes, so present it separately with that limitation. Do not represent a substitute Node server as Encore.

## Next measurement work

1. Complete the current-only controlled repeats on an otherwise idle machine, retaining every trial. Compare current local Nile against other frameworks only. Include p95/p99 and errors alongside throughput, and keep Node/Bun and validation/transport variants distinct.
2. Run the documented publication profile across concurrency 1/30/100/300, with 30-second measurements, five-second warmups and five rounds, before making public comparative claims. Prefer a separate load-generator machine and monitor utilization to establish whether the client saturates.
3. Preserve this development record and append native Encore evidence separately when available. Distinguish common-Zod validation from framework-native validation comparisons.

## Raw records and scope of this audit

- [Node suite](results/2026-10-17T14-44-40.306Z-node-development-oDUYL6/suite-summary.json), [plain trials](results/2026-10-17T14-44-40.306Z-node-development-oDUYL6/plain-results.json), [validated trials](results/2026-10-17T14-44-40.306Z-node-development-oDUYL6/validated-results.json), [generated summary](results/2026-10-17T14-44-40.306Z-node-development-oDUYL6/summary.md).
- [Bun suite](results/2026-10-17T14-51-48.641Z-bun-development-ERHZUh/suite-summary.json), [plain trials](results/2026-10-17T14-51-48.641Z-bun-development-ERHZUh/plain-results.json), [validated trials](results/2026-10-17T14-51-48.641Z-bun-development-ERHZUh/validated-results.json), [generated summary](results/2026-10-17T14-51-48.641Z-bun-development-ERHZUh/summary.md).

This audit initially added this report and subsequently revised it for the owner's current-only scope. Before that revision, the complete report and intent were saved under `/home/kizz/CODE/new-nile/backup/framework-benchmarks-production-runtime-2026-10-17/report-current-only/`. Analysis read saved JSON and fixture/harness source, independently recomputed medians/counts and checked manifest/artifact hashes. It ran no servers, installs, load or Git commands. Raw completed records were not changed. The useful next improvement is longer isolated repetition, not interpreting short-run variance as a product claim.
