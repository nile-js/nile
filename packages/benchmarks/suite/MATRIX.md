# Owner-run matrix

Run from the repository's `packages` directory after fixture dependencies and compiled adapters are prepared. This command starts the framework servers; the owner must execute it. The coding agent has not executed this launcher.

```sh
NODE_ENV=production node benchmarks/suite/run-matrix.mjs --nile-revision 9f5a173
```

Default development coverage is ten Node fixture variants, concurrency 100, five randomized rounds, 2-second measurements and 1-second warmups, separately for plain and validated modes. Nile current and published 0.0.17 are distinguished by source revision and artifact hash versus the pinned npm alias. Nest Express and Nest Fastify are separate variants, so the count is ten fixtures rather than ten independent framework families.

For publication evidence, run an otherwise idle machine:

```sh
NODE_ENV=production node benchmarks/suite/run-matrix.mjs --profile publication --nile-revision 9f5a173
```

This uses all concurrencies 1/30/100/300, 30-second measurements, 5-second warmups and five rounds, for both modes: at least 233 minutes for ten fixtures. The process will continue until both modes finish or the first failure stops the run. Do not start builds, installs or other benchmarks during this window.

Optional selections:

```sh
NODE_ENV=production node benchmarks/suite/run-matrix.mjs --framework nile,nile-release,fastify
NODE_ENV=production node benchmarks/suite/run-matrix.mjs --runtime bun --framework nile,nile-release,elysia,effect
```

The owner sets the standard `NODE_ENV=production` flag on the command. The coordinator and fixtures reject other runtime modes before creating servers, preventing development-only route generation. This flag is read only in the benchmark config module; environment files are never accessed. Readiness, telemetry and manifests record the actual setting. The coordinator itself runs on Node. The Bun track starts Bun fixture processes and uses the same Node HTTP load generator. Node and Bun results belong to different tracks; do not combine them into an unlabeled ranking. `--duration` and `--warmup` override seconds, with publication minima enforced. `--output-root /absolute/path` chooses an evidence parent. Update `--nile-revision` to the revision actually built; a working-tree artifact hash is always captured, and the coordinator does not run Git.

The launcher starts a separate process per fixture on fixed `127.0.0.1` ports 4100 onward. It waits for each `BENCHMARK_READY` JSON record, then externally checks all 300 action responses and validates payload/route identity. Validated mode additionally checks ten malformed input cases against the first, middle and last actions. Any readiness, preflight, child-process or generator failure stops the matrix and preserves its first failure. SIGINT/SIGTERM stop children; a 10-second cleanup deadline escalates to SIGKILL. No evidence is interpreted as a valid ranking when a run is incomplete or failed.

Each unique timestamped folder under `benchmarks/results` contains manifests, full generator results, fixture and generator stdout/stderr logs, readiness/startup memory, shutdown telemetry emitted by the servers, source artifact and lockfile hashes, exact dependency declarations and a suite summary. Server logs retain `BENCHMARK_TELEMETRY` records even if interrupted; a hard kill may prevent final telemetry. CPU and memory snapshots describe each entire server process lifetime, including startup and preflight; they are not per-request allocations or per-trial CPU measurements.

Encore remains explicitly excluded until its native CLI/runtime is available. The `encore` fixture must then be launched and measured through its real application runtime in a separate manifest. A plain Node emulation would not provide an Encore result.

The external runner methodology and its closed-loop/shared-host limitations remain documented in `../harness/README.md`. A performance claim must accompany workload, runtime, correctness, variance and environment information. This development command verifies the matrix; it cannot establish a universal fastest-framework claim.

Pure helper tests do not launch servers:

```sh
node benchmarks/suite/tests/matrix.test.mjs
```

New files only were added for this coordinator, so no existing originals needed backups. The design keeps startup and correctness checks outside measurement, records limitations explicitly and uses the existing protocol/HTTP helpers. Further useful validation is an owner-run development pass before any long publication run.
