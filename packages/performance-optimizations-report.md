# Nile performance optimization follow-up

## Approved changes

This follows the [startup and performance investigation](nile-performance-report.md). Its original baseline and final isolation measurements remain historical evidence; they do not measure the new optimizations below. The user approved pursuing the opportunities and explicitly chose default on-demand schema-conversion caching with per-action and app-wide opt-outs.

- **Schema discovery:** JSON Schema conversion is lazy, with a per-REST-app WeakMap keyed by schema identity. `action.cacheSchema: false` opts out per action; `rest.discovery.cacheSchemas: false` disables caching globally for that REST app. Conversion happens only when allowed discovery first needs it. Normal execution still validates with Zod and performs no JSON Schema conversion. Visibility/access checks run each time, without caching responses. First conversion fixes metadata, defaults, and custom callback output for that schema identity; opt out for dynamic conversions or use a new schema object. Observing global disable clears entries before later enablement.
- **Execution pipeline:** Skip unused work while preserving per-execution scope for every action, including actions without declared hooks. Global hook configuration and order, errors, validation, and direct/nested isolation remain part of the contract.
- **Middleware:** Empty/nonmatching selections skip runner construction. Only the canonical services path has a cached match list, invalidated on each middleware registration. Custom paths retain prefix matching without retained client-path entries; registration order, current-request snapshots, headers, registration limits, and error behavior remain unchanged.

## Verification and evidence status

Fresh verification on October 17 passes all 378 core tests across 23 files and 26 client tests across three files. The 27 additional core regressions comprise six optional-phase tests, seven middleware tests, and fourteen cache tests. Source TypeScript 7 checking (40 source/build-configuration files), targeted lint for eleven changed TypeScript files, and the production build pass. Full-project checking retains exactly the same nine pre-existing fixture diagnostic locations and codes; it is not a clean full-project type check.

The Ultracite wrapper could not prepare its read-only pnpm cache. The installed Biome executable checked the same project Ultracite preset directly, with no changes or installation. The logger fixture was restored byte-identically. All eight rebuilt release files are byte-identical to the preserved final artifact used for measurements.

Fresh test/build/type/lint logs, commands, the fixture diagnostic comparison and artifact hashes are preserved in `/home/kizz/CODE/new-nile/backup/performance-optimizations-2026-10-16/verification/final-2026-10-17/`. Fresh-built package checks pass for Node ESM and CommonJS caching/opt-outs/schema replacement/live validation/statistics, with 300-way HTTP ownership in each format. Strict TypeScript 7 NodeNext/Bundler consumers pass positive and negative option checks; the README cache example passes strict checking and native Node execution. Scripts, output and consumer inputs are preserved under `measurements/final-2026-10-17/`, including `consumer/`.

## Final paired measurements

Measured on October 17, 2026, using Bun 1.4.2 on an Intel Core i5-6300U, with 300 primary actions, identical installed dependencies, five alternating pairs per case and at least two seconds per trial. The baseline already includes startup statistics and correct execution isolation. Configured cases exercise validation, four action hooks and global before/after hooks with local callbacks. Authentication behavior is covered by regressions, not this benchmark. Schema cases compare caching disabled/enabled on the same final artifact, using 300 independent schema objects.

| Case | Baseline median req/s [range] | New median req/s [range] | Median change |
| --- | ---: | ---: | ---: |
| Engine only, direct, 100 concurrent | 32,942 [21,285–49,911] | 76,370 [61,155–124,941] | +131.8% |
| Engine only, HTTP, 100 concurrent | 9,948 [4,592–12,035] | 11,027 [9,241–15,290] | +10.9% |
| Engine only, configured HTTP, 100 concurrent | 7,309 [5,734–9,036] | 7,939 [6,412–9,509] | +8.6% |
| All changes, HTTP, 100 concurrent | 9,109 [7,094–10,724] | 11,483 [7,882–25,842] | +26.1% |
| All changes, HTTP, 300 concurrent | 7,212 [4,533–8,581] | 9,288 [6,794–10,978] | +28.8% |
| All changes, configured HTTP, 100 concurrent | 8,293 [3,690–10,203] | 9,413 [7,384–16,088] | +13.5% |
| Middleware only, 50 nonmatching entries, 100 concurrent | 18,268 [15,724–22,706] | 23,534 [21,623–23,855] | +28.8% |
| Warm discovery, 300 schemas, 1 concurrent | 74 [59–79] | 139 [123–145] | +87.6% |
| Warm discovery, 300 schemas, 30 concurrent | 50 [44–60] | 105 [91–129] | +111.7% |

Across 9 cases and 90 trials: 2,537,856 measured requests, 0 request errors and 0 response mismatches. All retained variant isolation and middleware-registration checks pass.

First discovery still converts all 300 requested schemas. Cold wildcard discovery took median 32.3 ms uncached (range 28.8–113.2) and 38.5 ms cached (range 36.1–65.0). No cold speed gain is claimed. Cache gains apply to repeated discovery; ordinary validation remains live.

The earlier short preliminary run showed a configured-engine regression of about 18%; it did not reproduce in the longer quiet repeat (+8.6% median). Both datasets remain preserved. Wide overlapping ranges and runtime/JIT/GC variation limit precision. These are in-process requests without TCP/TLS, external authentication, database or other external I/O, or production logging; they do not establish production capacity.

Final scripts, raw trials and artifact hashes are preserved in `/home/kizz/CODE/new-nile/backup/performance-optimizations-2026-10-16/measurements/final-2026-10-17/`. The preliminary source snapshots and four stage builds remain under `measurements/preliminary-stage-matrix/`.

## Preservation and limits

Pre-change REST source, README, previous task/plan/report, and all built files are preserved under `/home/kizz/CODE/new-nile/backup/performance-optimizations-2026-10-16/`, along with the original intent. Implementation owners preserve their remaining source before edits. README and optimization-plan drafts are additionally preserved in `docs-before-default-cache/`.

See [performance-optimizations-plan.md](performance-optimizations-plan.md) for sequencing. The nine full-project fixture diagnostics match the preserved baseline exactly. In-process measurements cannot establish production capacity; no Git operations, installations, environment-file access, listening servers, database commands, publication, or version bump are included.

## Changed files

Existing implementation files changed for this optimization: `nile/engine/engine.ts`, `nile/engine/types.ts`, `nile/rest/rest.ts`, `nile/rest/types.ts`, `nile/rest/intent-handlers.ts`, and `nile/README.md`.

New implementation and regression files: `nile/engine/tests/optional-phases.test.ts`, `nile/rest/middleware-matcher.ts`, `nile/rest/tests/middleware-matcher.test.ts`, `nile/rest/schema-cache.ts`, `nile/rest/tests/schema-cache.test.ts`, and `nile/rest/tests/schema-cache-http.test.ts`.

Task documentation: `performance-optimizations-plan.md`, `performance-optimizations-report.md`, and `task.md`. The generated release files are `nile/dist/index.js`, `index.cjs`, `index.d.ts`, `index.d.cts`, and their four maps.

Existing files were preserved before implementation in the task backup's `packages/`, `engine-before/`, and `schema-before/` directories. Documentation revisions are additionally preserved in `docs-before-default-cache/` and `docs-before-closure-2026-10-17/`, with intent. Previous generated output was moved to `/home/kizz/CODE/new-nile/trash/performance-optimizations-2026-10-16/dist/` rather than deleted. The final pre-verification artifact is preserved in `trash/performance-optimizations-2026-10-17-before-verification-build/dist/`; the fresh rebuild matches it byte-for-byte. New files have no pre-change original.

## Reflection

Separate candidates and behavioral regressions keep optimization accountable to existing authentication, hook order, mutable configuration and request ownership. The bounded middleware cache avoids retaining arbitrary client paths. Schema conversion needs an explicit freshness contract because metadata and conversion callbacks can change even when schema identity does not. The evidence handoff exposed a process weakness: final QA logs remained temporary. The fresh rerun now preserves them with the source and artifact manifests; retain noisy results rather than selecting favorable trials.
