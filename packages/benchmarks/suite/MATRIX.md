# Current-framework matrix

The owner explicitly authorized the agent to start required benchmark servers. Run from `packages` after the local Nile build, isolated dependency installation, native adapter compilation and actual Encore production images are ready.

## Exact request-count comparison

```sh
NODE_ENV=production node benchmarks/suite/run-interleaved-count.mjs --nile-revision 9f5a173
```

Default Node comparison: current Nile, Elysia, Express, Fastify, tRPC, Nest Express, Nest Fastify, Adonis, Effect and Encore. It measures 1M requests for each variant across memory reads, SQLite reads and SQLite read/write transactions, validation off/on, three repeats per cell. Concurrency is 100. The allocation is 55,555 or 55,556 requests per trial, totaling exactly 1M per framework. Five-second warmups and correctness probes are excluded from that total.

Separate native Bun comparison:

```sh
NODE_ENV=production node benchmarks/suite/run-interleaved-count.mjs --runtime bun --framework nile,elysia,effect --nile-revision 9f5a173
```

Then focus on Nile's underlying components:

```sh
NODE_ENV=production node benchmarks/suite/run-interleaved-count.mjs --runtime bun --framework nile,hono,bun --nile-revision 9f5a173
```

`--concurrency` accepts 1,30,100,300; choose a separate targeted run when exploring concurrency. `--requests` changes the total per framework, never the repeat count. `--warmup` must be at least five seconds. `--output-root` chooses a result parent. Runtime modes must remain production. No environment files are read or changed.

The coordinator starts one server at a time on loopback port4100, waits for actual readiness, checks all300 actions plus invalid validated inputs, runs one measured repeat, stops the fixture and checkpoints evidence. All selected frameworks finish round1 before any round2, then round3. Framework order is seeded once and rotated across rounds; each framework runs its selected workload scenarios once in that round. Every trial gets a fresh isolated SQLite file; only its warmup and following measured requests share that file. Detailed operations and durability are in [WORKLOADS.md](shared/WORKLOADS.md).

`--server-cpu 1 --client-cpu 0` are defaults for this PC's separate physical cores. Physical topology is verified, and both SMT siblings of each selected physical core are assigned to that side (server1,3; client0,2 on this PC). `--quiet-idle 75` requires three consecutive samples meeting that idle percentage on both selected logical CPUs and the host, with no swap-out and at least1GiB available memory. While other work is active the coordinator waits. It does not stop other applications. Owner-approved temporary process pauses are managed separately and restored afterward. Desktop activity during measured work is recorded, not hidden.

Every timestamped result folder contains manifests, full raw trials and histograms, server/harness logs, process/readiness/SQLite metadata, host-load samples, count-summary.json and summary.md. Arithmetic means and ranges use all three trials. Failed responses or incorrect counts invalidate the cell and stop the run. SIGINT/SIGTERM clean up owned processes and retain partial evidence; interrupted runs are not final comparisons. Encore runs its actual compiled production container with the same CPU affinity and no CFS quota; owned containers are stopped after each individual round trial.

## Earlier exploratory protocol

`run-matrix.mjs` remains available for preserved duration-based development/publication checks (five rounds; current Nile only). It excludes Encore because that older coordinator does not manage native containers. It is not the new three-repeat request-count protocol. Preliminary historical results are labelled separately and never relabelled as 1M-request evidence.

## Verification

```sh
node --test --test-isolation=none benchmarks/harness/*.test.mjs benchmarks/suite/tests/*.test.mjs
```

These include exact-budget/error tests, every-adapter operation injection, actual SQLite mutation checks and framework fixture registration. Complete HTTP preflight still runs before each measured cell. Shared-host contention, closed-loop coordinated omission, differing native wire envelopes and SQLite driver/runtime differences limit conclusions. Throughput alone cannot establish universal architectural superiority.

The main count coordinator defaults to `--sqlite-synchronous normal`, as selected by the owner. It still executes real committed transactions. WAL/NORMAL can lose recent commits after power loss; WAL/FULL adds a WAL synchronization at every commit. See [SQLite's synchronous documentation](https://sqlite.org/pragma.html#pragma_synchronous). The choice must accompany every result.

Separate targeted durability run:

```sh
NODE_ENV=production node benchmarks/suite/run-interleaved-count.mjs --runtime bun --framework nile,hono,bun --requests 18000 --sqlite-synchronous full --nile-revision 9f5a173
```

This targeted run uses 1000 measured requests per repeat per workload cell (18,000 per framework); it is explicitly separate from the 1M-per-framework main comparison. It examines disk-flush costs without repeating many hours of disk-bound broad comparisons.

The revised count coordinator defaults to `--client-runtime bun` for all server tracks. Node remains the process coordinator. Actual client runtime/transport are recorded independently from server runtime. Native Bun fetch with checked framed-body reads passed calibration after the Node client reached a CPU ceiling on this PC. Client CPU is still recorded; sharing the same PC remains a limitation. `--client-runtime node` preserves the diagnostic transport. The current Bun native pool supports up to256 concurrent requests; the main matrix uses100. A300-concurrency diagnostic requires the Node client rather than silently queuing excess native-fetch workers or changing environment settings.

## Desktop-bias corrections and preserved protocol

The earlier `run-count-matrix.mjs` remains the historical contiguous-repeat coordinator. Its 47 completed scenarios and raw trials are preserved. It must not be described as interleaved. The owner corrected the ordering before measurements finished.

For a corrective subset, pass `--selection FILE` containing a `cells` array of `{ framework, operation, mode }` objects. The selected scenarios retain their original per-repeat budgets; a subset correction is not itself a complete1M-per-framework run. The audited selection and reasons are saved in [node-corrective-selection.json](../evidence/interleaved-review-2026-10-17/node-corrective-selection.json). All Nile scenarios, unfinished scenarios, >=20% fastest/slowest spreads and identified Effect cross-mode anomalies are included. Every selected scenario gets three new interleaved repeats; original and corrected individual trials are never mixed.

```sh
NODE_ENV=production node benchmarks/suite/run-interleaved-count.mjs --selection benchmarks/evidence/interleaved-review-2026-10-17/node-corrective-selection.json --nile-revision 9f5a173
```

Interleaved checkpoints retain successful individual rounds. `--resume RESULT_FOLDER` requires matching configuration, selected scenarios, runtime/artifact/lock identities and frozen protocol sources; repeat the same `--selection FILE` when resuming a corrective subset. Completed comparisons cannot be resumed. Failed/incomplete work is preserved rather than counted as a successful round.
