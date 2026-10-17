# Nile performance optimization plan

## Intent

The user approved investigating and implementing the measured opportunities: schema conversion reuse, unused pipeline phases, and middleware overhead. Preserve global hooks, authentication, visibility, discovery, per-execution isolation, error behavior, and dynamic middleware registration.

## 1. Preserve and approve designs

Existing REST source, README, task documents, and generated output are preserved in `/home/kizz/CODE/new-nile/backup/performance-optimizations-2026-10-16/`, with intent. Implementation owners preserve their remaining source. Root reviews concrete designs before dependent edits.

## 2. Implement independently measured candidates

- Approved revised schema strategy: "we should cache all schemas by default, and add a no cache prop per action level plus global disable...schemas...validation...notdiscover...loadthemondemand". JSON Schema conversion is lazy and cached by schema identity in a per-REST-app WeakMap. `action.cacheSchema` and `rest.discovery.cacheSchemas` default to true; false opts out at action or app scope. Startup and ordinary execution perform no JSON Schema conversion; normal Zod validation is unchanged. Authorization/visibility are evaluated each request and responses are not cached. First conversion freezes dynamic metadata/default/callback results until a new schema identity or opt-out; this behavior is documented prominently. Observing global disable clears existing cache entries before later re-enabling. Implementation and fourteen cache regressions are complete.
- Skip unused pipeline work while always preserving action scope, because handlers and global context access can use hook state even without declared hooks. Six new engine regression tests cover the optional phases; final paired measurements are complete.
- Avoid middleware filtering and runner construction when no middleware matches. Proposed matching optimization: cache only the canonical service endpoint path, invalidate on registration, and keep ordinary prefix matching for all other paths. This holds a single bounded entry and preserves custom-path behavior. Root approved this design; implementation is complete with seven focused regression tests. Seven middleware regressions cover matching and registration semantics. The production build, combined source verification and paired comparisons pass; evidence is preserved durably.

## 3. Verify semantics

Test dynamic middleware registration after requests, overlapping and nonmatching prefixes, order, error and short-circuit handling, next invocation, registration limits, and bounded path memory. Retain isolation and authorization regressions. No existing assertions are weakened.

## 4. Stage builds and measurements

Root coordinates builds and paired benchmarks after each stage, using the same dependencies and representative action/discovery/middleware loads. Report distributions, correctness checks, and scope limits. Do not start listening servers or run database commands.

## 5. Close documentation

Record actual changes, backups, measured gains or regressions, remaining limitations, and reflection. No installation, Git operations, environment-file access, publication, or version bump is included.

## Completion

All three candidates are implemented. Fresh verification passes 378 core and 26 client tests, source/build checking, and targeted lint; full-project checking preserves the same nine fixture diagnostics. The release rebuild is byte-identical. Nine paired benchmark cases and 90 trials complete with zero response errors or mismatches. See the report for medians, ranges, cold discovery cost, provenance, changed files and limits.
