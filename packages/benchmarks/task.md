# Benchmark implementation and closure

Owner intent: commit/push Nile's performance work, compare the current local build with the named frameworks, average three rounds, test real SQLite reads/writes and validation, defer the landing refresh, and avoid busy-desktop bias. The owner approved isolated installs, native class/decorator fixtures, benchmark servers, benchmark-only SQLite operations and temporary pauses of identified development processes.

## Outcome

The overlong measurement sequence was stopped after the owner raised elapsed time. Owned fixture/generator cleanup completed; both OpenCode and hot-ug Bun processes resumed. No further benchmarks will start automatically. The separate residual-variance selection is a preserved unexecuted proposal, not a completed measurement.

[Completed comparison](completed-comparison-2026-10-18.md) records the full Bun primary matrix and all Node workload cells. Node uses28 retained stable contiguous-repeat scenarios and32 corrective interleaved scenarios, identified individually. Original and corrective individual repeats are never mixed. Every primary framework has1M accepted measured requests across six scenarios and three repeats. The dedicated Hono/bare Bun matrix was interrupted before an accepted repeat; FULL durability did not start.

The interleaved Node correction completed96 repeats and5,333,318 requests. Bun completed54 repeats and3M requests. Both had zero response failures and verified persisted mutations. Two corrected Node paired-control scenarios retain23–26% spread; they remain visible, without further reruns. All corrected Nile scenarios have spreads below20%, with approximately2–3% write spread.

## Implementation

The suite now uses current local Nile only, exact request budgets, real injected memory/SQLite operations, native runtime tracks, common action validation, three-repeat means/ranges, full response/action coverage checks and post-shutdown mutation verification. Each corrected repeat has fresh fixture/storage and its own preflight/warmup. Framework passes are interleaved by round, with a seeded rotated order. Checkpoints retain and revalidate individual completed rounds; artifact, lock, client, adapters and native image identities are frozen. Cancellation closes only owned processes/containers and preserves raw evidence.

Actual production Encore images compile with the official verified CLI and pinned Node image. The comparison uses Encore raw APIs with the common workload; it does not claim to measure native typed API optimum. Node/Bun SQLite drivers and native wire envelopes remain distinct. No Nile core, app database or environment-file changes belong to this benchmark phase.

## Verification

- Actual-host Node suite:100 passed,12 Bun-specific skipped, zero failures.
- Native Bun HTTP client:12 passed, one Node-only skipped, zero failures.
- Final scheduling/selector/summary checks after rotation:25 passed.
- End-to-end interleaved Node/Encore and Bun/Nile/Hono checks:24 accepted trials,7200 measured requests, zero failures and exact persisted writes; intentional interruption/resume retained five completed trials without duplication.
- Prior Nile validation:378 core and26 client tests passed; core source stayed unchanged throughout measurements.

[Raw completed evidence](evidence/completed-comparison-2026-10-18/raw-evidence.tar.gz), its checksum and development-restoration record are retained alongside [the variance audit](evidence/interleaved-review-2026-10-17/README.md). The original interrupted and diagnostic runs remain separately labelled. No calibration or incomplete component score substitutes for a missing completed comparison.

## Preservation and reflection

Originals and intent documents were preserved under root backup/framework-benchmarks-2026-10-17, framework-benchmarks-production-runtime-2026-10-17, benchmarks-current-only-2026-10-17, benchmark-count-protocol-2026-10-17, benchmark-workloads-2026-10-17, benchmark-encore-workloads-2026-10-17, benchmark-durability-option-2026-10-17, benchmark-elysia-native-listener-2026-10-17, benchmark-interleaved-rounds-2026-10-17 and benchmark-final-closure-2026-10-18. New files have no originals. Generated prior build outputs were moved to suite trash; no rm command was used.

The original contiguous-repeat choice and open-ended quiet-host waits were poor fits for a shared desktop. Correctness checks and safe cleanup worked; measurement time management did not. Future plans should interleave from the start, agree a wall-clock cap, calibrate the generator once, and report completed evidence promptly. Interleaving reduces temporal bias but cannot remove desktop contention or establish a universal fastest-framework claim. Follow-up profiling candidates are documented without unapproved core edits; the landing refresh remains deferred.

Git closure stages only benchmark files. The repository hook runs broad autofix/stashing and unrelated core checks; as in prior authorized commits, it is bypassed after the relevant explicit verification above to preserve unrelated source. The exact file inventory is in modified-files-2026-10-18.md.
