# Interleaved-round correction

The owner pointed out that contiguous repeats could favor frameworks measured while the desktop was quieter. The previous series was stopped safely after47 completed Node scenarios. Both temporarily paused development processes resumed, and a host check found no remaining owned benchmark fixture, generator or container.

The old raw evidence remains under `results/2026-10-17T16-52-01.373Z-node-count-gnJWij`. Its incomplete overall status is retained. Correct responses establish correctness, not freedom from performance bias.

## Selection before corrected measurements

The explicit spread is `100 * (maximum throughput / minimum throughput - 1)`. A20% threshold triggers a complete three-round rerun. It is a practical review criterion, not a statistical significance test or proof of desktop interference.

| Original scenario | Spread |
|---|---:|
| tRPC memory read, validated |95.51%|
| Fastify SQLite read, plain |55.56%|
| Adonis SQLite read/write, plain |31.84%|
| Nest Express SQLite read, plain |27.11%|
| Nest Fastify SQLite read, plain |21.84%|
| Express SQLite read/write, plain |20.93%|

All six Nile scenarios are rerun at the owner's request. Its five completed scenarios had spreads of4.99–18.34%; the sixth was unfinished. Both validation modes of each spread-outlier workload are included as paired controls. All unfinished scenarios are included. Both Effect memory-read modes and both SQLite-read modes are also rerun: their original cross-mode differences were anomalous and coincided with different host conditions. The resulting selection has32 scenarios, each requiring three fresh interleaved repeats.

Effect's original plain memory rate was~4865/sec versus~9460/sec validated; this must not be described as a validation speedup. Aggregate host samples include benchmark server and client work, so idle percentages are not pure background CPU measurements. The tRPC validated-memory aggregate window spans a long pause; its whole-window host average must not be attributed to measured execution alone. Raw five-second samples and per-trial timing remain the appropriate evidence for investigating that period.

[variance-audit.json](variance-audit.json) retains every original scenario's spread and selection reasons. [node-corrective-selection.json](node-corrective-selection.json) freezes the corrective selection before timing. None of the new individual repeats will be mixed with old repeats or selected based on a favorable rate. Final reports identify retained contiguous-repeat scenarios separately from corrective interleaved scenarios.

## Corrected protocol

Round1 runs every selected framework and its selected workloads once; only then can round2 begin, followed by round3. A seeded framework order rotates across rounds. Every trial has a fresh process/storage, preflight, five-second warmup, its original exact budget and all300-action coverage checks. SQLite mutations are verified after shutdown. A scenario's mean/range requires all three distinct valid rounds.

The Node correction is a subset, not a fresh complete1M-per-framework matrix. Fresh Bun primary/component matrices retain the full1M budgets with corrected ordering. The separate FULL-durability check retains18K/framework. Native images and protocol/client/adapter sources are frozen for resume validation.

## Verification

- Actual-host Node suite:100 checks passed,12 Bun-specific checks skipped, zero failures.
- Bun-native client suite:12 passed, one Node-only check skipped, zero failures.
- Real interleaved Node/Encore and Bun/Hono/Nile checks passed:24 successful individual trials and7200 accepted measured requests, zero failures, exact persisted mutations. The Node run also passed intentional interruption/resume after retaining five completed trials. Their small budgets and disabled idle threshold make them correctness checks only.
- Final scheduler/selector/summary checks:25 passed after adding positional rotation. For three frameworks, each occupies every execution position once. The transport and workload code are unchanged by that final ordering adjustment.

Modified existing files were backed up with the owner's intent under root `backup/benchmark-interleaved-rounds-2026-10-17`. New files have no originals. No Nile core or application database changes were made.
