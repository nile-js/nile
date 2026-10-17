# Nile startup statistics and performance plan

## User intent

Show total services, total actions, and per-service registration speed by default, expose a synchronous plain-object `stats()` snapshot, and investigate performance for roughly 300 actions and overlapping requests. The user also approved isolating hook state, asking "yes hope not the global hooks?" Global callback configuration and order remain unchanged.

## 1. Trace the existing flow

**Complete.** Registration indexes supplied definitions once, expected O(services + actions); action lookup is expected O(1). Timings exclude module imports and schema construction. Request tracing exposed shared hook state, confirmed by a controlled overlap.

## 2. Add the agreed feature and correctness fix

**Complete.** The default service table includes counts and registration durations, with `logServices: false` opt-out. `server.stats()` returns copied per-service metadata plus registration and startup durations; `engine.stats()` omits startup duration. Per-execution asynchronous scope isolates HTTP, direct, and nested hook state while preserving transport/session references and global hook behavior. README documents the outside-execution fallback and returned pipeline logs.

## 3. Verify behavior and the package

**Complete with the existing fixture limitation documented.** All 351 core tests across 19 files and 26 client tests pass, including nine statistics tests and four concurrency regressions. Source/configuration checking, targeted lint, the release build, strict TypeScript 7 NodeNext/Bundler consumers, and Node ESM/CommonJS runtime checks pass. The original overlap and 300 simultaneously suspended HTTP requests pass state/log/session/action/global-order ownership checks. Full TypeScript 7 checking retains exactly nine existing fixture diagnostics with no new locations or codes. Logger output is restored byte-identically.

## 4. Benchmark representative scale

**Complete.** The original baseline covers 36 cases, 108 trials, and 198,180 requests. A five-trial alternating old/new comparison adds 520,000 measured requests across eight cases and 80 trials, with no echo mismatch or request error. Both artifacts use the same dependencies. Combined changes show lower engine medians and variable HTTP results, not a proven speed gain. Method, exact tables, limits, and proposals are in [nile-performance-report.md](nile-performance-report.md).

## 5. Report findings and preserve evidence

**Complete.** Baseline evidence is preserved in the task backup's `performance-baseline/`; final evidence is in `performance-final/` and the verification directories. Prioritize measured schema discovery work, unused pipeline phases, middleware matching, and JSON costs only after review. Any future fast path must preserve execution scope even without declared hooks. No additional optimization is implemented. [task.md](task.md) records modified files, backups, and reflection.

## Preservation and boundaries

Original files, subsequent concurrency/refinement copies, documentation drafts, generated output, and intent are preserved under `/home/kizz/CODE/new-nile/backup/startup-stats-performance-2026-10-16/`. Replaced build output is preserved in project trash. No Git operations, environment-file access, installations, listening servers, database commands, publication, or version bump are included. The dependency-upgrade report is unchanged by this task.
