# Completed framework measurements —18 October2026

The measurement sequence was stopped after the owner raised the excessive elapsed time. Approved paused development processes were restored. No further benchmark stages are scheduled to start.

Current local Nile0.0.17 uses source9f5a173; no old/published Nile was benchmarked in these comparison runs. All rows exercise300 actions at concurrency100, with real SQLite WAL/NORMAL for database scenarios. Rates below are arithmetic means of three repeats; warmups and correctness probes are excluded.

## Bun1.4.2 —complete comparison

Each framework completed exactly1M measured requests. All54 repeats passed, with zero response failures and verified persisted database counters. Rounds were interleaved across frameworks, with rotated framework positions and fresh fixtures/storage per trial.

| Framework | Memory off | Memory on | DB read off | DB read on | DB write off | DB write on |
|---|---:|---:|---:|---:|---:|---:|
| nile | 14,488 | 14,346 | 12,088 | 10,940 | 6,042 | 5,623 |
| elysia | 17,331 | 18,683 | 17,650 | 16,743 | 8,633 | 8,721 |
| effect | 14,820 | 15,479 | 13,134 | 10,484 | 5,994 | 5,991 |

## Node24.16.0 —completed scenarios

Every framework has1M accepted measured requests across six scenarios. `*` marks an interleaved corrective three-repeat rerun; other scenarios retain the earlier contiguous-repeat protocol. Individual old and new repeats are never mixed.32 corrected scenarios completed96 new repeats and5,333,318 measured requests with zero failures.

| Framework | Memory off | Memory on | DB read off | DB read on | DB write off | DB write on |
|---|---:|---:|---:|---:|---:|---:|
| nile | 5,127* | 5,331* | 4,384* | 4,178* | 2,942* | 2,680* |
| elysia | 7,839 | 7,408 | 4,775 | 4,668 | 2,854 | 3,616* |
| express | 5,232 | 4,951 | 3,192 | 3,144 | 2,849* | 2,567* |
| fastify | 13,097 | 13,308 | 10,576* | 9,719* | 4,826* | 4,803* |
| trpc | 2,143* | 2,133* | 1,643 | 1,583 | 1,546* | 1,498* |
| nest-express | 4,258 | 4,169 | 3,564* | 3,350* | 1,883 | 2,443* |
| nest-fastify | 10,741 | 9,960 | 8,907* | 8,034* | 3,966 | 4,531* |
| adonis | 7,421 | 6,884 | 4,399 | 4,018 | 3,551* | 3,172* |
| effect | 9,719* | 9,455* | 7,487* | 7,037* | 3,675 | 4,118* |
| encore | 1,984 | 1,965 | 1,921 | 1,956 | 1,742* | 1,720* |

## Ranges and latency

p95 values are averages of trial percentiles, not pooled percentiles. All three measured rates are retained.

| Runtime | Framework | Workload | Validation | Mean req/s | Min–max req/s | Mean p95 ms |
|---|---|---|---|---:|---:|---:|
| Bun | nile | memory-read | plain | 14,487.8 | 12,221.7–15,774.5 | 11.5 |
| Bun | nile | memory-read | validated | 14,345.9 | 11,967.0–15,566.3 | 11.6 |
| Bun | nile | sqlite-read | plain | 12,087.9 | 10,316.7–13,023.3 | 12.6 |
| Bun | nile | sqlite-read | validated | 10,939.6 | 9,923.8–12,887.1 | 13.9 |
| Bun | nile | sqlite-read-write | plain | 6,041.7 | 5,359.3–6,553.1 | 57.5 |
| Bun | nile | sqlite-read-write | validated | 5,623.4 | 5,068.8–6,541.5 | 59.7 |
| Bun | elysia | memory-read | plain | 17,330.8 | 14,996.7–19,163.9 | 9.6 |
| Bun | elysia | memory-read | validated | 18,682.8 | 17,797.7–19,146.0 | 8.1 |
| Bun | elysia | sqlite-read | plain | 17,649.7 | 15,216.9–18,948.7 | 9.1 |
| Bun | elysia | sqlite-read | validated | 16,742.9 | 14,936.5–18,437.5 | 9.7 |
| Bun | elysia | sqlite-read-write | plain | 8,632.9 | 8,008.8–9,048.9 | 39.1 |
| Bun | elysia | sqlite-read-write | validated | 8,721.2 | 7,768.2–9,372.0 | 36.8 |
| Bun | effect | memory-read | plain | 14,819.5 | 13,303.6–16,127.1 | 11.6 |
| Bun | effect | memory-read | validated | 15,478.5 | 12,994.9–16,739.8 | 10.9 |
| Bun | effect | sqlite-read | plain | 13,133.8 | 10,948.2–14,374.8 | 11.9 |
| Bun | effect | sqlite-read | validated | 10,483.7 | 9,357.5–11,470.8 | 15.6 |
| Bun | effect | sqlite-read-write | plain | 5,994.3 | 5,861.0–6,119.9 | 52.3 |
| Bun | effect | sqlite-read-write | validated | 5,990.7 | 5,285.8–7,206.6 | 59.7 |
| Node | express | memory-read | plain | 5,232.4 | 4,937.7–5,438.0 | 27.4 |
| Node | adonis | memory-read | plain | 7,420.8 | 7,358.3–7,455.9 | 16.4 |
| Node | encore | memory-read | plain | 1,984.5 | 1,963.2–2,001.3 | 68.8 |
| Node | nest-fastify | memory-read | plain | 10,741.2 | 10,171.7–11,108.0 | 14.0 |
| Node | fastify | memory-read | plain | 13,097.0 | 11,819.2–13,753.8 | 11.8 |
| Node | effect | memory-read | plain | 9,718.9 | 9,597.1–9,851.0 | 18.4 |
| Node | elysia | memory-read | plain | 7,839.1 | 7,800.3–7,903.0 | 16.0 |
| Node | nest-express | memory-read | plain | 4,258.1 | 4,015.1–4,493.8 | 35.0 |
| Node | nile | memory-read | plain | 5,127.4 | 4,618.4–5,386.9 | 26.7 |
| Node | trpc | memory-read | plain | 2,143.0 | 2,118.3–2,188.5 | 64.9 |
| Node | nile | memory-read | validated | 5,330.7 | 5,184.5–5,447.7 | 22.1 |
| Node | fastify | memory-read | validated | 13,308.5 | 13,216.4–13,470.1 | 11.8 |
| Node | nest-express | memory-read | validated | 4,169.0 | 4,056.1–4,332.6 | 34.0 |
| Node | adonis | memory-read | validated | 6,884.3 | 6,790.1–6,941.2 | 17.6 |
| Node | nest-fastify | memory-read | validated | 9,959.6 | 9,356.1–10,863.9 | 15.0 |
| Node | encore | memory-read | validated | 1,964.9 | 1,949.2–1,993.2 | 69.8 |
| Node | effect | memory-read | validated | 9,455.3 | 9,403.1–9,538.1 | 18.9 |
| Node | express | memory-read | validated | 4,951.2 | 4,572.5–5,173.8 | 28.3 |
| Node | elysia | memory-read | validated | 7,408.1 | 6,699.2–7,824.9 | 19.6 |
| Node | trpc | memory-read | validated | 2,133.0 | 2,102.9–2,188.2 | 59.8 |
| Node | nest-express | sqlite-read | plain | 3,563.7 | 3,307.3–3,723.6 | 36.6 |
| Node | fastify | sqlite-read | plain | 10,575.9 | 10,418.9–10,688.7 | 13.5 |
| Node | nest-fastify | sqlite-read | plain | 8,907.2 | 8,714.6–9,158.1 | 15.1 |
| Node | encore | sqlite-read | plain | 1,920.8 | 1,887.7–1,964.2 | 72.5 |
| Node | adonis | sqlite-read | plain | 4,398.8 | 3,927.1–4,657.9 | 31.1 |
| Node | effect | sqlite-read | plain | 7,486.7 | 7,143.7–7,684.0 | 23.0 |
| Node | elysia | sqlite-read | plain | 4,774.8 | 4,532.5–4,920.9 | 27.1 |
| Node | nile | sqlite-read | plain | 4,384.1 | 4,144.6–4,524.8 | 29.1 |
| Node | express | sqlite-read | plain | 3,192.3 | 3,032.3–3,342.3 | 45.2 |
| Node | trpc | sqlite-read | plain | 1,643.0 | 1,596.7–1,675.4 | 73.2 |
| Node | adonis | sqlite-read | validated | 4,018.3 | 3,965.5–4,077.3 | 30.7 |
| Node | effect | sqlite-read | validated | 7,037.2 | 6,245.8–7,458.9 | 26.0 |
| Node | elysia | sqlite-read | validated | 4,668.1 | 4,337.0–4,888.5 | 29.4 |
| Node | nest-fastify | sqlite-read | validated | 8,034.5 | 7,029.6–8,649.6 | 17.6 |
| Node | encore | sqlite-read | validated | 1,956.5 | 1,923.0–1,981.0 | 69.0 |
| Node | nile | sqlite-read | validated | 4,178.0 | 4,000.7–4,531.3 | 33.5 |
| Node | express | sqlite-read | validated | 3,144.2 | 3,041.0–3,255.3 | 43.5 |
| Node | nest-express | sqlite-read | validated | 3,350.1 | 3,265.2–3,497.0 | 41.4 |
| Node | fastify | sqlite-read | validated | 9,719.4 | 8,300.1–10,468.9 | 14.5 |
| Node | trpc | sqlite-read | validated | 1,582.7 | 1,565.5–1,599.7 | 77.1 |
| Node | elysia | sqlite-read-write | plain | 2,853.7 | 2,646.8–2,975.1 | 102.6 |
| Node | nest-express | sqlite-read-write | plain | 1,882.8 | 1,830.8–1,941.7 | 129.7 |
| Node | nile | sqlite-read-write | plain | 2,941.5 | 2,914.1–2,989.0 | 82.7 |
| Node | adonis | sqlite-read-write | plain | 3,551.1 | 3,518.3–3,579.9 | 74.5 |
| Node | nest-fastify | sqlite-read-write | plain | 3,966.1 | 3,919.9–3,999.7 | 72.8 |
| Node | effect | sqlite-read-write | plain | 3,674.9 | 3,633.9–3,735.9 | 73.2 |
| Node | express | sqlite-read-write | plain | 2,848.8 | 2,725.6–3,027.0 | 77.1 |
| Node | nile | sqlite-read-write | validated | 2,679.7 | 2,653.3–2,703.1 | 89.6 |
| Node | elysia | sqlite-read-write | validated | 3,616.5 | 3,441.1–3,742.1 | 73.4 |
| Node | express | sqlite-read-write | validated | 2,566.5 | 2,394.5–2,661.1 | 92.4 |
| Node | fastify | sqlite-read-write | plain | 4,826.3 | 4,635.0–5,084.5 | 68.3 |
| Node | fastify | sqlite-read-write | validated | 4,803.3 | 4,668.0–4,986.6 | 62.7 |
| Node | trpc | sqlite-read-write | plain | 1,546.4 | 1,521.1–1,559.9 | 109.9 |
| Node | trpc | sqlite-read-write | validated | 1,498.2 | 1,481.2–1,530.5 | 113.7 |
| Node | nest-express | sqlite-read-write | validated | 2,442.8 | 2,309.3–2,513.1 | 88.7 |
| Node | nest-fastify | sqlite-read-write | validated | 4,530.8 | 4,384.6–4,663.0 | 70.0 |
| Node | adonis | sqlite-read-write | validated | 3,171.8 | 2,936.4–3,383.1 | 80.7 |
| Node | effect | sqlite-read-write | validated | 4,117.7 | 4,065.6–4,162.9 | 72.6 |
| Node | encore | sqlite-read-write | plain | 1,741.7 | 1,712.3–1,770.7 | 100.6 |
| Node | encore | sqlite-read-write | validated | 1,720.3 | 1,685.4–1,750.5 | 105.2 |

## Incomplete checks and limits

The dedicated Nile/Hono/bare Bun component matrix was interrupted before any accepted measured repeat; it cannot support a comparison. The separate FULL-durability stage and the proposed residual-variance follow-up did not start. Earlier short calibrations remain diagnostics and are not substituted for those missing results.

Two corrected Node paired-control rows still show23–26% spread: validated SQLite reads in Fastify and Nest/Fastify. They remain visible as variable results; no favorable repeat was selected. All corrected Nile scenarios have spreads below20%, including approximately2–3% for writes.

These are shared-desktop, closed-loop results, not proof that Nile is the fastest TypeScript framework. The generator and server use separate physical cores including SMT siblings, but desktop/thermal activity and client CPU limits remain. Idle gates precede measurements; telemetry includes benchmark work and cannot be interpreted as pure background CPU. Runtime/SQLite driver and wire-envelope differences also matter. Encore uses its actual production runtime through the raw API Node bridge, not its native typed API optimum.

The elapsed time grew through repeated quiet-host gates, fresh process/database setup and added corrective rounds. The process should have been time-bounded and the completed comparison reported sooner. The owner-requested correction exposed real issues with the first repeat ordering; future runs should interleave from the start and agree a wall-clock budget before execution.

## Evidence and follow-up

[Variance audit and corrective selection](evidence/interleaved-review-2026-10-17/README.md), [protocol](suite/MATRIX.md), [source-based profiling candidates](nile-follow-up-opportunities.md), [historical implementation gains](../nile-old-vs-new.md), [deferred landing refresh](../landing-refresh-deferred.md).

Raw source folders:

- `benchmarks/results/2026-10-17T16-52-01.373Z-node-count-gnJWij` —original trials, retained unchanged.
- `benchmarks/results/2026-10-17T20-19-55.133Z-node-interleaved-3CNDFF` —complete interleaved Node correction.
- `benchmarks/results/2026-10-17T21-15-32.303Z-bun-interleaved-QrBSIp` —complete interleaved Bun comparison.

Local artifact SHA256: `24024c1ad52d1a36c7730ae8d446845fd7c4b6142f842c96c208490d07f5038a`. Runtime/lock/source identities, raw manifests, trial histograms, response counters and persisted-write checks remain in those folders.

[Archived raw completed evidence](evidence/completed-comparison-2026-10-18/raw-evidence.tar.gz), [SHA256](evidence/completed-comparison-2026-10-18/archive-sha256.txt), and [development-process restoration](evidence/completed-comparison-2026-10-18/development-restoration.json).
