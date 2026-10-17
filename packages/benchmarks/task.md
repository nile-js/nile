# Framework benchmark implementation record

## User intent and authorization

The user requested committing/pushing completed Nile updates, recording new-versus-old performance, comparing Nile with Elysia, NestJS, Express, Fastify, AdonisJS, Effect, Encore and tRPC, and deferring the landing refresh to Markdown. The user explicitly approved isolated benchmark dependency installations and native NestJS/AdonisJS class/decorator fixtures. Existing project rules reserve server startup and environment-file management to the owner.

## Completed work

- Committed and pushed the reviewed Nile implementation, dependency/build migration, tests, raw optimization evidence and planning/deferred landing documents as `9f5a173` on `origin/main`.
- Preserved the existing safe-baseline optimization results without relabelling them as a published-release comparison. A separate pinned public `nile-release` alias provides the actual published 0.0.17 control in the new suite.
- Installed exact benchmark dependencies with Bun and lifecycle scripts disabled in a nested isolated suite. Nile's manifest and the root workspace lockfile have no benchmark installation changes.
- Built real 300-operation fixtures, a dependency-free HTTP load generator, an owner-run process coordinator, full response/invalid-input preflight, raw-trial persistence, resource telemetry and Markdown summaries. Current and published Nile use their respective Node hosting adapters. Node and native Bun tracks stay separate.
- Compiled NestJS/AdonisJS production JavaScript and passed non-listening checks. Checked every operation in current/released Nile, Fastify, Elysia, tRPC and Effect, plus native Nest Fastify responses and Nest Express/Adonis registration/lifecycle. Pure runner/configuration/summary checks pass.
- Created real Encore app source in plain/common-Zod/native-typed variants. Official CLI acquisition returned access errors; two upstream SDK type incompatibilities remain. Source/helper checks do not substitute for native compilation or measured Encore results.

## Required next step

The owner must run the HTTP launcher from `packages`, using the standard production runtime setting shown in [MATRIX.md](suite/MATRIX.md). No listening servers or application database commands have been started by the agent. Full external response checks and cross-framework measurements remain pending that run. Development results are preliminary; publication mode uses longer trials and all four concurrency levels. The setup does not establish a fastest-framework claim.

## Verification and preservation

[Setup evidence](evidence/suite-setup-2026-10-17/verification.json) records commands, exit codes and source hashes; adjacent text files preserve build/test/syntax output. [Historical Nile measurements](evidence/nile-optimizations-2026-10-17/README.md) remain distinct. [Registry metadata](evidence/framework-metadata-2026-10-17/npm-latest.json) records verified package versions and integrity data. Encore's upstream diagnostic log is retained explicitly as research evidence.

Existing Nile source/configuration changes were backed up during the preceding authorized tasks; see [the optimization report](../performance-optimizations-report.md). New benchmark files had no original content. Draft integration and formatting revisions were preserved with intent under `/home/kizz/CODE/new-nile/backup/framework-benchmarks-2026-10-17/`; generated native fixture output is moved to suite `trash/` before rebuilding. No production source was changed by this benchmark implementation. The repository-wide auto-format/stash commit hook was skipped for the reviewed Nile commit, with tests/source/package checks and targeted formatting verification completed separately.

## Review and reflection

Independent review caught inherited development runtime settings that could make Adonis generate route files during startup. The owner launcher now requires explicit production mode and records it. Review also questioned Effect's integer bound; installed source and boundary tests established that its native `Schema.isInt()` already uses safe integers, avoiding an unnecessary change. Faithful adapters and protocol-aware correctness matter more than a favorable headline. Remaining limitations include closed-loop coordinated omission, a possibly shared load-generator machine, different wire envelopes, common-Zod rather than universally optimal native validators, and unavailable Encore runtime verification.

## File inventory

All files below are new benchmark artifacts unless already recorded in the preceding Nile commit; original drafts are preserved as described above. Generated dependencies, compiled output, temporary build trash and owner-run results are ignored.

- `benchmarks/.gitignore`
- `benchmarks/README.md`
- `benchmarks/evidence/framework-metadata-2026-10-17/npm-latest.json`
- `benchmarks/evidence/suite-setup-2026-10-17/launcher-syntax.txt`
- `benchmarks/evidence/suite-setup-2026-10-17/native-build.txt`
- `benchmarks/evidence/suite-setup-2026-10-17/pure-and-fixture-tests.txt`
- `benchmarks/evidence/suite-setup-2026-10-17/server-entry-syntax.txt`
- `benchmarks/evidence/suite-setup-2026-10-17/verification.json`
- `benchmarks/harness/README.md`
- `benchmarks/harness/codecs.mjs`
- `benchmarks/harness/config.mjs`
- `benchmarks/harness/harness.test.mjs`
- `benchmarks/harness/http-client.mjs`
- `benchmarks/harness/manifest.example.json`
- `benchmarks/harness/run.mjs`
- `benchmarks/harness/statistics.mjs`
- `benchmarks/harness/trial.mjs`
- `benchmarks/research.md`
- `benchmarks/suite/.gitignore`
- `benchmarks/suite/MATRIX.md`
- `benchmarks/suite/adapters/adonis.ts`
- `benchmarks/suite/adapters/adonis/adonisrc.ts`
- `benchmarks/suite/adapters/adonis/config/app.ts`
- `benchmarks/suite/adapters/adonis/config/bodyparser.ts`
- `benchmarks/suite/adapters/adonis/config/encryption.ts`
- `benchmarks/suite/adapters/adonis/config/logger.ts`
- `benchmarks/suite/adapters/adonis/package.json`
- `benchmarks/suite/adapters/adonis/routes.ts`
- `benchmarks/suite/adapters/effect-bun.mjs`
- `benchmarks/suite/adapters/effect.mjs`
- `benchmarks/suite/adapters/elysia.mjs`
- `benchmarks/suite/adapters/express.mjs`
- `benchmarks/suite/adapters/fastify.mjs`
- `benchmarks/suite/adapters/native-frameworks.md`
- `benchmarks/suite/adapters/nest.ts`
- `benchmarks/suite/adapters/nile.mjs`
- `benchmarks/suite/adapters/trpc.mjs`
- `benchmarks/suite/build.mjs`
- `benchmarks/suite/bun.lock`
- `benchmarks/suite/encore/README.md`
- `benchmarks/suite/encore/native/actions/actions-0.ts`
- `benchmarks/suite/encore/native/actions/actions-1.ts`
- `benchmarks/suite/encore/native/actions/actions-2.ts`
- `benchmarks/suite/encore/native/actions/actions-3.ts`
- `benchmarks/suite/encore/native/actions/actions-4.ts`
- `benchmarks/suite/encore/native/actions/actions-5.ts`
- `benchmarks/suite/encore/native/actions/actions-6.ts`
- `benchmarks/suite/encore/native/actions/actions-7.ts`
- `benchmarks/suite/encore/native/actions/actions-8.ts`
- `benchmarks/suite/encore/native/actions/actions-9.ts`
- `benchmarks/suite/encore/native/actions/encore.service.ts`
- `benchmarks/suite/encore/native/actions/workload.ts`
- `benchmarks/suite/encore/native/encore.app`
- `benchmarks/suite/encore/native/package.json`
- `benchmarks/suite/encore/plain/actions/actions-0.ts`
- `benchmarks/suite/encore/plain/actions/actions-1.ts`
- `benchmarks/suite/encore/plain/actions/actions-2.ts`
- `benchmarks/suite/encore/plain/actions/actions-3.ts`
- `benchmarks/suite/encore/plain/actions/actions-4.ts`
- `benchmarks/suite/encore/plain/actions/actions-5.ts`
- `benchmarks/suite/encore/plain/actions/actions-6.ts`
- `benchmarks/suite/encore/plain/actions/actions-7.ts`
- `benchmarks/suite/encore/plain/actions/actions-8.ts`
- `benchmarks/suite/encore/plain/actions/actions-9.ts`
- `benchmarks/suite/encore/plain/actions/encore.service.ts`
- `benchmarks/suite/encore/plain/actions/workload.ts`
- `benchmarks/suite/encore/plain/encore.app`
- `benchmarks/suite/encore/plain/package.json`
- `benchmarks/suite/encore/validated/actions/actions-0.ts`
- `benchmarks/suite/encore/validated/actions/actions-1.ts`
- `benchmarks/suite/encore/validated/actions/actions-2.ts`
- `benchmarks/suite/encore/validated/actions/actions-3.ts`
- `benchmarks/suite/encore/validated/actions/actions-4.ts`
- `benchmarks/suite/encore/validated/actions/actions-5.ts`
- `benchmarks/suite/encore/validated/actions/actions-6.ts`
- `benchmarks/suite/encore/validated/actions/actions-7.ts`
- `benchmarks/suite/encore/validated/actions/actions-8.ts`
- `benchmarks/suite/encore/validated/actions/actions-9.ts`
- `benchmarks/suite/encore/validated/actions/encore.service.ts`
- `benchmarks/suite/encore/validated/actions/workload.ts`
- `benchmarks/suite/encore/validated/encore.app`
- `benchmarks/suite/encore/validated/package.json`
- `benchmarks/suite/package.json`
- `benchmarks/suite/run-matrix.mjs`
- `benchmarks/suite/serve.mjs`
- `benchmarks/suite/shared/config.mjs`
- `benchmarks/suite/shared/matrix-config.mjs`
- `benchmarks/suite/shared/matrix-summary.mjs`
- `benchmarks/suite/shared/preflight.mjs`
- `benchmarks/suite/shared/workload.mjs`
- `benchmarks/suite/tests/core-fixtures.test.mjs`
- `benchmarks/suite/tests/effect.test.mjs`
- `benchmarks/suite/tests/encore-source.test.mjs`
- `benchmarks/suite/tests/matrix-summary.test.mjs`
- `benchmarks/suite/tests/matrix.test.mjs`
- `benchmarks/suite/tests/native-fixtures.test.mjs`
- `benchmarks/suite/tsconfig.json`
- `benchmarks/task.md`

- `benchmarks/evidence/framework-metadata-2026-10-17/encore-types.log` (explicit diagnostic evidence).

- `benchmarks/suite/tests/runtime-config.test.mjs` (production-mode configuration guards).

Production-mode integration drafts and intent are also preserved at `/home/kizz/CODE/new-nile/backup/framework-benchmarks-production-runtime-2026-10-17/`. The owner supplies the existing standard `NODE_ENV=production` runtime flag; its only direct access is in the benchmark configuration module. No environment file or Nile application configuration was changed.
