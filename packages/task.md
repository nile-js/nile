# Nile startup statistics and performance task

## Intent and approved scope

Add default startup counts and per-service registration timings, expose a synchronous plain-object `stats()` snapshot, and investigate overhead for roughly 300 actions and overlapping requests. The user also approved fixing the demonstrated hook-state leak while preserving global hook callbacks, configuration, and order.

See [the plan](startup-stats-performance-plan.md) and [the performance report](nile-performance-report.md). Pre-change files, the approved intent, and baseline evidence are preserved at `/home/kizz/CODE/new-nile/backup/startup-stats-performance-2026-10-16/`.

## Current status

Statistics and per-execution hook-state isolation are implemented. README documents measured-time boundaries, plain-object snapshots, logging opt-out, and the execution-context boundary. All four isolation regressions and all core/client tests pass. Strict fresh-build consumers, the original built-artifact overlap reproduction, the 300-overlap ownership test, and paired benchmarks are complete and passing for their stated checks.

The exploratory baseline covers 36 cases, 108 trials, and 198,180 requests. Its separate controlled hook-state reproduction fails isolation before the fix. Performance proposals remain unimplemented pending review.

## Source QA and build status

All 351 core tests across 19 files pass: 338 existing tests, nine new statistics tests, and four concurrency regressions. All 26 client tests pass. The concurrency regressions cover overlapping HTTP and direct executions, isolated errors, nested executions, inherited session and REST/WebSocket/RPC references, and preserved global before/after hook order. The new concurrency test file remains below the 400-line limit at 398 lines.

Source type checking and targeted lint pass. Full TypeScript 7 checking still reports the same nine existing test-fixture diagnostic locations and codes, with no new diagnostics; it is not a clean full-project type check. A fresh ESM/CommonJS JavaScript, declaration, and source-map build passes.

Strict TypeScript 7 NodeNext/Bundler statistics consumers and negative type assertions pass. Node ESM/CommonJS runtime checks pass. Both the original overlap reproduction and 300 simultaneously suspended HTTP requests preserve state, logs, action, transport/session identity, and global hook order. Paired benchmarks complete 520,000 measured requests with no request errors or echo mismatches; engine throughput is lower and HTTP results vary, without a speedup claim. The fix avoids duplicate context allocation; broader performance proposals remain unimplemented.

## Changed files and preservation

Existing files changed: `nile/engine/engine.ts`, `nile/engine/types.ts`, `nile/nile/server.ts`, `nile/nile/types.ts`, `nile/nile/nile.ts`, `nile/nile/request-scope.ts`, `nile/index.ts`, `nile/nile/tests/server.test.ts`, and `nile/README.md`.

New files: `nile/nile/stats.ts`, `nile/nile/hook-context.ts`, `nile/nile/tests/stats.test.ts`, `nile/engine/tests/concurrency.test.ts`, `startup-stats-performance-plan.md`, `nile-performance-report.md`, and `task.md`. All eight release files in `nile/dist/` are regenerated.

Original files and subsequent concurrency/refinement backups are preserved under the task backup directory, including documentation drafts. The logger fixture is restored byte-identically. Baseline evidence is preserved in `performance-baseline/`; final evidence is preserved in `performance-final/` and the task verification directories. Original generated output is preserved in project trash.

## Closure and reflection

All planned feature, regression, build, consumer, and concurrency checks are complete. The unchanged nine fixture diagnostics remain explicit. Default statistics describe registration and startup, not module import time or live traffic. Baseline throughput alone would have missed the cross-request ownership bug; controlled barriers and nested execution tests established the fix. Paired measurements show a correctness cost and noisy HTTP differences, so future performance work must preserve isolation and measure each proposal independently. No Git operations, environment-file access, installations, servers, database commands, publication, or version bump are included.


## Approved optimization follow-up

The user subsequently approved pursuing performance opportunities and chose lazy, default-on JSON Schema conversion caching with action-level and global opt-outs. This supersedes the historical statements above that performance proposals remain unimplemented. See [the optimization plan](performance-optimizations-plan.md) and [the optimization report](performance-optimizations-report.md) for the implementation, complete file list, backups and evidence status.

The follow-up implements optional-phase skipping, bounded middleware selection caching and lazy discovery conversion. Fresh verification passes 378 core and 26 client tests, source/build checking and targeted lint, preserving exactly the same nine fixture diagnostics. All eight rebuilt artifacts match the measured final build byte-for-byte. Final measurements cover nine cases, 90 trials and 2,537,856 requests with zero errors or mismatches. Fresh QA and final measurement evidence are preserved under the optimization backup directory. See the report for results, ranges, cold discovery timing, freshness controls and measurement limits. No Git operations, installs, environment-file access, listening servers, database commands, publication or version bump are included.
