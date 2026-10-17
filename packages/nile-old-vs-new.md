# Nile before and after the performance updates

Recorded October 17, 2026. Source: [full optimization report](performance-optimizations-report.md).

## Which old Nile is measured

The paired baseline is the preserved local build immediately before optional-phase, middleware and schema-cache optimizations. It already includes startup statistics and correct per-execution hook isolation. The new build adds those three optimizations using the same installed dependencies.

This comparison does not measure the latest published package or an older release. A released-package comparison needs its own pinned artifact and a fresh matched run. The earlier shared-hook implementation fails the controlled isolation reproduction; its throughput cannot stand in for equivalent correct behavior.

The earlier [statistics and isolation report](nile-performance-report.md) documents a separate experiment. Its throughput numbers and the numbers here must not be multiplied or combined into an end-to-end old-release gain.

## Existing measurements

Bun 1.4.2, Intel Core i5-6300U, one process, 300 primary actions, five alternating pairs per case and at least two seconds per trial. HTTP means in-process request dispatch, without a listening socket. Figures are median requests per second, with the full trial range in brackets.

| Matched workload | Before | After | Median change |
| --- | ---: | ---: | ---: |
| Direct engine, 100 concurrent, engine change only | 32,942 [21,285–49,911] | 76,370 [61,155–124,941] | +131.8% |
| HTTP, 100 concurrent, engine change only | 9,948 [4,592–12,035] | 11,027 [9,241–15,290] | +10.9% |
| Configured HTTP, 100 concurrent, engine change only | 7,309 [5,734–9,036] | 7,939 [6,412–9,509] | +8.6% |
| HTTP, 100 concurrent, all changes | 9,109 [7,094–10,724] | 11,483 [7,882–25,842] | +26.1% |
| HTTP, 300 concurrent, all changes | 7,212 [4,533–8,581] | 9,288 [6,794–10,978] | +28.8% |
| Configured HTTP, 100 concurrent, all changes | 8,293 [3,690–10,203] | 9,413 [7,384–16,088] | +13.5% |
| HTTP, 50 nonmatching middleware entries, 100 concurrent, middleware change only | 18,268 [15,724–22,706] | 23,534 [21,623–23,855] | +28.8% |
| Warm discovery, 300 schemas, 1 concurrent | 74 [59–79] | 139 [123–145] | +87.6% |
| Warm discovery, 300 schemas, 30 concurrent | 50 [44–60] | 105 [91–129] | +111.7% |

The configured workload includes validation, four action hooks and global before/after callbacks. Authentication is covered by correctness regressions, not measured here. Discovery compares cache-disabled and cache-enabled operation on the same final artifact using 300 independent schema objects.

Across nine cases and 90 trials, 2,537,856 measured requests completed with zero request errors and zero response mismatches. These counts describe the final experiment only.

Cold wildcard discovery has no demonstrated gain: uncached median 32.3 ms [28.8–113.2], cached median 38.5 ms [36.1–65.0]. The cache improves repeated conversion, while ordinary Zod validation remains live. Use `action.cacheSchema: false` or `rest.discovery.cacheSchemas: false` when conversion metadata must stay dynamic.

## What the evidence supports

The all-change in-process HTTP medians improved by 26.1% at concurrency 100 and 28.8% at concurrency 300 in this experiment. Configured execution and repeated discovery also improved in their measured cases. Wide overlapping ranges limit the precision of these estimates.

The preliminary short run included a configured-engine regression of approximately 18%. The longer quiet repeat measured +8.6%; both datasets remain preserved. Report both when discussing measurement stability.

No result here establishes production network capacity or a fastest-framework ranking. TCP, TLS, proxies, external authentication, databases, production logging and multi-worker deployments were excluded. Correct state ownership remains a prerequisite for every future performance comparison.

## Reproduction evidence

Committed raw trials and the source/artifact hash manifest: [optimization evidence archive](benchmarks/evidence/nile-optimizations-2026-10-17/README.md). The archive retains all final stage and schema trials; the original local scripts and build snapshots remain in the backup below.

Raw trials, scripts, consumer checks and artifact hashes: `/home/kizz/CODE/new-nile/backup/performance-optimizations-2026-10-16/measurements/final-2026-10-17/`.

Preliminary stage matrix: the sibling `measurements/preliminary-stage-matrix/` directory. Fresh build, source checks and test evidence: the sibling `verification/final-2026-10-17/` directory. The [full report](performance-optimizations-report.md) records changed files, backups and limitations.
