# Shared business workloads

The measured launcher always injects `createWorkload(...).execute` into each framework. Factory defaults preserve earlier fixture checks only; those defaults are not used by the measured launcher. Validation remains the same bounded Zod input schema, or the framework's already documented common-schema integration.

All three operations receive `{ payload: { id, value }, action }` and return `{ id, value: storedValue + 1, action }`. There are 300 routes/actions and 1,000 business rows keyed by the input `value` (0–999). `id` is a response identity field. The immutable stored value equals the row key; validation and JSON response checks remain meaningful for every operation.

- `memory-read`: look up a preseeded in-process row and read its value.
- `sqlite-read`: execute a prepared indexed `SELECT value, writes` against a real SQLite file.
- `sqlite-read-write`: execute `BEGIN IMMEDIATE`, the same prepared SELECT, a prepared UPDATE that increments the persisted write counter, and COMMIT. Each successful request commits an actual mutation. The response uses the immutable stored value; the counter is deliberately separate so concurrent responses have a deterministic oracle. Integration tests independently open the file and verify the counter advances exactly once per injected operation.

SQLite uses WAL, synchronous FULL (SQLite numeric value 2), a 5,000ms busy timeout, prepared statements and 1,000 rows seeded before listener readiness. Connections live for the fixture lifetime and close on process exit. The Node track uses `node:sqlite`; the Bun track uses `bun:sqlite`. These are synchronous APIs: database work blocks that runtime's event loop. Comparisons across Node and Bun therefore include their driver/runtime differences and must be reported separately. Read tests are warmed, small-data local reads rather than a remote or cold database benchmark. Full durability write throughput depends on the host filesystem and storage hardware.

`--database-path` must name a fresh file in a dedicated temporary directory with a `nile-benchmark-` prefix. Existing files and paths outside the temporary directory are refused. The database, WAL and SHM artifacts are retained for audit; the benchmark never selects an application's database.

Encore's native worker bootstrap may use `reuseSeeded: true` with an explicit `isolationRoot`. The host first seeds a fresh benchmark file and closes it; workers open that same file. Reuse requires the file directly inside the real isolation root, no symlink, the `nile-benchmark-v1` schema marker and the expected 1,000 rows. This is explicit worker sharing, not a proxy or a substituted HTTP server. Readiness metadata records the reused seed and each native SQLite/runtime version. Multiple workers may contend for SQLite's write lock; that contention is part of Encore's measured native architecture.

Hono uses 300 native Hono routes and its normal Fetch response API, with its Node HTTP adapter or Bun.serve as appropriate. The bare Bun baseline uses Bun.serve with 300 exact pathname handlers, method checks, JSON parsing and the identical injected business operation. It intentionally measures the runtime baseline without framework routing or lifecycle features. It must be labeled separately from full frameworks.

No measured load or listening servers were started by the fixture implementation tests. Unit and integration checks exercise real operations directly through Fetch, injection, native controller or route functions. The later benchmark audit must verify all mounted/listening fixtures before measured runs.
