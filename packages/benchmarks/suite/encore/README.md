# Encore native benchmark fixtures

Three independent Encore apps register 300 literal POST paths, `/actions/action-0` through `/actions/action-299`:

- `plain`: native `api.raw`, JSON decoding/encoding, no field validation.
- `validated`: native `api.raw` with the suite's common Zod 4.6.7 validation.
- `native`: typed `api` endpoints with Rust field/bounds validation and JS integer guards. This is a separate native-validation diagnostic; its workload remains the original in-memory increment.

The primary plain/common-Zod fixtures now import the same `shared/workload-store.mjs` operation helper as the other frameworks. Their normal Encore transport and 300 compiler-visible route declarations remain intact. Supported operations are `memory-read`, `sqlite-read`, and `sqlite-read-write`. Responses retain the shared `{ id, value: row.value + 1, action }` oracle.

## Production runtime

The official Encore CLI 1.58.6 has been downloaded and verified against the SHA256 in the pinned official Homebrew formula. The initial `encore.dev` installer was inaccessible; the verified official CloudFront archive provided the CLI. Provenance is in `../../evidence/framework-metadata-2026-10-17/encore-cli-source.json` and `encore-cli-verified.json`.

Production images use the real compiler via `encore build docker`; they are not handmade Node wrappers. The pinned base is:

```text
node@sha256:85e31dc0dcafd6754ca56b6abe73360f10278b38bb70153bb2b61dbb8d1c481e
```

This is the existing Node 24.16.0 slim base used by the matched benchmark. Image entrypoints run Encore's generated combined application with Node. The Encore Rust runtime performs its native transport work. No Encore cloud deployment, application database or external service is involved.

The count coordinator selects plain or validated production images through `shared/encore-process.mjs`. It starts only the requested fixture, uses host networking and an explicit CPU set without a CFS quota, verifies a real HTTP response and the container's Node version, then stops its uniquely named container and drains logs on completion or failed startup. Container identity, image identity, CPU configuration and resource snapshots accompany the evidence.

## Explicit workload configuration

`shared/encore-workload.mjs` reads only the fixed optional mount `/tmp/nile-benchmark-runtime.json`. An absent mount selects memory work. Invalid configuration fails before serving requests. SQLite configuration contains:

```json
{
  "workload": "sqlite-read-write",
  "databasePath": "/tmp/nile-benchmark-count-example/encore.sqlite",
  "isolationRoot": "/tmp/nile-benchmark-count-example",
  "sqliteSynchronous": "normal"
}
```

The coordinator creates a fresh database and seeds 1,000 rows once on the host, closes that connection, then mounts the dedicated directory at the same container path. Each Encore worker opens its own connection to that same file. The shared helper requires an existing nonsymlink file directly under the explicit temporary isolation root and verifies the benchmark schema marker and seed before accepting it. It never opens an application database.

Every connection uses WAL and a five-second busy timeout. The main comparison explicitly selects `sqliteSynchronous: "normal"` (actual PRAGMA value 1); separate targeted durability checks use `"full"` (value 2). The generic shared helper retains FULL when no choice is supplied. WAL/NORMAL can lose recent commits after an OS crash or power loss; it is a distinct durability profile and must not be conflated with FULL. Reads perform the same prepared `SELECT`; writes perform `BEGIN IMMEDIATE; SELECT; UPDATE writes; COMMIT`. Immutable row values keep responses verifiable while every successful write commits a real counter increment. Initial seeding, connection setup, HTTP readiness probes, correctness preflight and warmup are outside measured request counts.

## Verification boundaries

Source tests retain the 300-route assertion and exercise real JSON handling, common-Zod failures, mounted configuration and actual SQLite read/write counters. The official production compiler remains the authority for Encore application compilation. Strict TS7 checking separately encounters the two previously documented upstream `DummySocket` assertion errors in `encore.dev/api/node_http.ts`; no dependency source was patched.

Development `encore run` includes local instrumentation and must never be presented as a production framework ranking. The primary comparison uses compiled Docker images. Background desktop load and swap samples still determine whether any measurement is valid.

Sources: [raw API](https://encore.dev/docs/ts/primitives/raw-endpoints), [typed API](https://encore.dev/docs/ts/primitives/defining-apis), [validation](https://encore.dev/docs/ts/primitives/validation), [production builds](https://encore.dev/docs/self-host/build), [runtime architecture](https://encore.dev/blog/rust-runtime).
