# Nile framework benchmarks

Compare Nile, Hono, Elysia, Express, Fastify, NestJS, AdonisJS, Effect, tRPC and Encore using the same authenticated ecommerce workload. Each framework has one entry: Nile uses Bun native; Hono, Elysia and Effect use Bun; Express, Fastify, NestJS (Fastify adapter), AdonisJS and tRPC use Node; Encore uses its compiled production Node/Rust image. Exact dependency versions are pinned in `suite/bun.lock`.

## Setup

The complete matrix supports Linux x64 and requires Bun, Node 22.18+ / 24.11+ / 26+, Docker with permission to use its daemon, and `tar`. The recorded results used Bun 1.4.2 and Node 24.16.0; use those versions to match the original setup. Runtime versions are captured for every new run. Run these commands from the repository root:

```sh
bun packages/benchmarks/suite/setup.mjs
bun packages/benchmarks/suite/setup.mjs --check
```

Setup installs locked workspace and isolated benchmark dependencies, builds the local Nile package, downloads the official Encore 1.58.6 compiler with SHA-256 verification when needed, and builds the actual Encore Docker image against a digest-pinned Node base. An installed Encore compiler must match that version. It records image/build-input hashes and stops the compiler daemon it starts. It does not run the benchmark. Docker image builds may download several hundred MB; no external database or credentials are required.

## Check and measure

```sh
bun run --cwd packages/benchmarks/suite check
NODE_ENV=production bun packages/benchmarks/suite/ecommerce/full/run.mjs --smoke
NODE_ENV=production bun packages/benchmarks/suite/ecommerce/full/run.mjs --rounds=6
```

The smoke check covers all ten frameworks in both validation modes without timed load. Each measured round runs every framework before the next round. The starting framework rotates and validation-mode order alternates. Use `--rounds=3` for a shorter run. Six rounds measure 3.6 million requests plus 360,000 warmup requests, so allow ten minutes or more, particularly for Encore. The runner saves progress after each sample under ignored `benchmarks/results/` and prints the exact directory. Servers and uniquely named containers are stopped after each sample, including on failure or interruption. Other desktop processes are left alone.

To continue an interrupted measurement, pass `--resume=path/to/results.json` with the original `--rounds` value. Sources, dependencies, runtimes and image must still match. Re-run setup after changing image inputs; stale images are rejected.

## What each request does

Each backend exposes 300 operations: 50 shops with catalog, product, cart, quote, checkout and order operations. Nile dispatches its actions through one endpoint. Before timing, the runner checks all operations, JWT rejection, payload validation, CORS and state resets. It then runs 500 practice shopping journeys, clears their state, and measures 5,000 six-request journeys with up to 32 concurrent shoppers. Every response is checked and the final state must contain 5,000 orders and zero carts.

JWT and CORS stay on. The two modes enable or disable the same Zod payload schemas; Nile retains its request-envelope checks in both. tRPC keeps its native protocol envelopes, and Encore keeps its native CORS behavior. Data lives in memory: these results do not measure database persistence, durability or external payment services. The load generator and application use separate processes on the same machine.

## Generate rankings and charts

Rankings require a completed run and include every declared round, arithmetic means, ranges, variation and pairwise ratios. Substitute the results path printed by the runner:

```sh
bun packages/benchmarks/suite/ecommerce/full/rank-results.mjs path/to/results.json
```

This creates `presentation/rankings.json` and `presentation/RANKING.md` next to the raw results. Optional charts require Python 3.10+ and Pillow:

```sh
python3 -m venv packages/benchmarks/suite/tools/chart-venv
packages/benchmarks/suite/tools/chart-venv/bin/pip install -r packages/benchmarks/suite/requirements.txt
packages/benchmarks/suite/tools/chart-venv/bin/python packages/benchmarks/suite/ecommerce/full/render-chart.py path/to/presentation/rankings.json
```

The renderer creates PNG, SVG and offline HTML views, verifies the source hash, highlights Nile in sky blue, and prints the methodology and measured machine specifications. Font appearance can vary by installed fonts. Both reporting commands accept an optional output directory.

## Recorded results

[Reference data and charts](reference/README.md) preserve the recorded comparison. They came from an actively used PC; close averages and overlapping ranges do not establish a reliable winner. New measurements can differ with machine, runtime, framework versions and desktop activity.

The optional published-package comparison uses the locked `@nilejs/nile@0.0.17` fixture, current Nile native and current Nile Hono, all on Bun:

```sh
NODE_ENV=production bun packages/benchmarks/suite/ecommerce/published-compare/run.mjs
```

It runs three interleaved rounds per validation mode and writes separate raw results under `benchmarks/results/`. It compares whole installed packages and resolved dependencies, rather than isolating framework-code changes.
