# Current Nile request-count benchmark plan

Owner intent: remove benchmark ghost processes, use current local Nile only, average three repeats, issue 1M measured requests per framework, compare read-only and isolated database read/write work with validation on/off, then examine Nile alongside its Bun/Hono components. Owner explicitly authorized needed servers and isolated benchmark dependencies/database work.

## Protocol

- Use the current local Nile build; preserve artifact SHA256 and source revision. Do not benchmark the old package.
- Six cells: memory read, SQLite read, SQLite read/write, each action-validation off/on. Common Zod input rules; framework request-envelope handling stays native.
- Three measured repeats in every cell. Divide 1,000,000 requests exactly across 18 trials; 55,555 or 55,556 per trial. Warmup and correctness probes are additional and excluded from that budget.
- Concurrency 100 for the broad comparison, then targeted Nile/Hono/Bun concurrency checks. Retain raw request counts, every-response validation, latency histograms, means and ranges. No selective best-run reporting.
- Single framework fixture at a time. Pin server and generator to different physical CPU cores on this machine. Require three consecutive quiet samples before each cell. Preserve background CPU, swap and process-lifetime telemetry.
- Fresh isolated SQLite files under dedicated temporary benchmark directories. WAL, synchronous NORMAL for the main comparison; FULL for separate targeted checks, 1,000 seed rows, prepared statements. Reads select immutable data; writes select and increment a persisted counter inside BEGIN IMMEDIATE/COMMIT. Responses remain deterministic so concurrent correctness can be checked. Preparation occurs outside timing. Each framework cell starts fresh; repeats share its DB after warmup.
- Node and Bun tracks use their native built-in SQLite drivers. Record versions and avoid attributing SQLite driver differences purely to framework overhead. Encore uses its actual native production runtime, not a substitute server.
- Stop all owned processes/containers afterward. Never kill unrelated user work without approval. Never read environment files.

## Work phases

1. Audit and clean only verified benchmark processes. Record actual background CPU deltas rather than lifetime process percentages.
2. Extend existing workload factories with injected operations and real Hono/Bun component fixtures; preserve native framework transports.
3. Extend existing harness with exact count budgets and three-repeat means. Add count coordinator reusing its transport, codecs, preflight, statistics and checkpoint evidence modules.
4. Verify exact-budget/error behavior, database mutations, adapter integration and native builds before measurements.
5. Run the broad comparison, then targeted Nile/Hono/Bun. Preserve interrupted and superseded exploratory runs under their original protocol.
6. Publish a local evidence report and commit/push authorized updates. Landing refresh remains deferred.

## Preservation and review

Existing files are copied before modifications under root backup/benchmark-count-protocol-2026-10-17, backup/benchmark-workloads-2026-10-17 and backup/benchmark-encore-workloads-2026-10-17 with intent documents. New modules have no originals. No Nile core changes are planned. Exact modified-file inventory and verification belong in task.md at closure.

## Durability calibration and owner decision

After native image builds finished, a fresh isolated WAL/FULL calibration completed1000 committed transactions in7.116seconds (~140.5/sec). The owner chose WAL/NORMAL for the main comparison and separate full-durability checks on Nile/Hono/Bun. Both options are implemented and actual PRAGMA values verified before measurement. The focused FULL run uses18,000 measured requests per framework (1000per repeat per cell), explicitly distinguished from the main1M budget. [SQLite's primary documentation](https://sqlite.org/pragma.html#pragma_synchronous) explains the durability difference.
