import { assertDatabasePath } from "./workload-store.mjs";

/** Check actual persisted side effects after shutdown, outside all request timings. */
export async function verifyDatabaseWrites({
  databasePath,
  isolationRoot,
  operation,
  results,
  framework,
}) {
  if (!databasePath) return { storage: "memory", writes: 0 };
  const path = assertDatabasePath(databasePath, {
    reuseSeeded: true,
    isolationRoot,
  });
  const { DatabaseSync } = await import("node:sqlite");
  const database = new DatabaseSync(path, { readOnly: true });
  const marker = database
    .prepare("SELECT format FROM benchmark_metadata")
    .get();
  const row = database
    .prepare(
      "SELECT COUNT(*) AS rows, SUM(writes) AS writes FROM benchmark_rows"
    )
    .get();
  database.close();
  if (marker?.format !== "nile-benchmark-v1" || row.rows !== 1000)
    throw Error("Benchmark database integrity check failed");
  const requests = results.trials.reduce(
    (sum, trial) => sum + trial.counters.successful,
    0
  );
  const expectedWrites =
    operation === "sqlite-read-write"
      ? requests + 300 + (framework === "encore" ? 1 : 0)
      : 0;
  if (row.writes !== expectedWrites)
    throw Error(
      `Persisted SQLite write count mismatch: ${row.writes} versus ${expectedWrites}`
    );
  return {
    storage: "sqlite",
    rows: row.rows,
    writes: row.writes,
    expectedWrites,
    verified: true,
    includes:
      "Measured requests, timed warmups, 300 preflight operations and Encore readiness probe when applicable",
  };
}
