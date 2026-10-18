import { existsSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";

export const WORKLOAD_NAMES = [
  "memory-read",
  "sqlite-read",
  "sqlite-read-write",
];
const ROW_COUNT = 1000;

/** Require a fresh file beneath a dedicated temporary benchmark directory. */
export function assertDatabasePath(
  databasePath,
  { reuseSeeded = false, isolationRoot } = {}
) {
  if (!databasePath || !isAbsolute(databasePath))
    throw Error("SQLite workload requires an absolute --database-path");
  const parent = realpathSync(resolve(databasePath, ".."));
  const root = realpathSync(tmpdir());
  const child = relative(root, parent);
  if (!child || child.startsWith(`..${sep}`) || isAbsolute(child))
    throw Error("Database must be inside a dedicated temporary directory");
  if (!parent.split(sep).some((part) => part.startsWith("nile-benchmark-")))
    throw Error("Database directory must use the nile-benchmark- prefix");
  if (reuseSeeded) {
    if (!isolationRoot || parent !== realpathSync(isolationRoot))
      throw Error(
        "Worker database must be directly inside its explicit isolationRoot"
      );
    if (!existsSync(databasePath))
      throw Error("Worker requires the preseeded benchmark database");
    const file = realpathSync(databasePath);
    if (file !== resolve(parent, databasePath.split(sep).at(-1)))
      throw Error("Refusing a symbolic database file");
  } else if (existsSync(databasePath)) {
    throw Error(
      "Refusing an existing database; each fixture needs a fresh file"
    );
  }
  return resolve(parent, databasePath.split(sep).at(-1));
}

/** Build identical synchronous business work, outside framework routing and validation. */
export async function createWorkload({
  workload = "memory-read",
  databasePath,
  runtime = "node",
  reuseSeeded = false,
  isolationRoot,
  sqliteSynchronous = "full",
} = {}) {
  if (!WORKLOAD_NAMES.includes(workload)) throw Error("Unsupported workload");
  if (!["full", "normal"].includes(sqliteSynchronous))
    throw Error("sqliteSynchronous must be full or normal");
  if (workload === "memory-read") {
    const rows = Array.from({ length: ROW_COUNT }, (_, value) => ({ value }));
    return {
      execute: ({ payload, action }) => ({
        id: payload.id,
        value: rows[payload.value].value + 1,
        action,
      }),
      close: () => {},
      metadata: { workload, rows: ROW_COUNT, storage: "memory", runtime },
    };
  }
  const path = assertDatabasePath(databasePath, { reuseSeeded, isolationRoot });
  const driver =
    runtime === "bun"
      ? await import("bun:sqlite")
      : await import("node:sqlite");
  const database =
    runtime === "bun"
      ? new driver.Database(path, { create: true })
      : new driver.DatabaseSync(path);
  database.exec(
    `PRAGMA journal_mode=WAL; PRAGMA synchronous=${sqliteSynchronous.toUpperCase()}; PRAGMA busy_timeout=5000;`
  );
  const prepare = (sql) =>
    runtime === "bun" ? database.query(sql) : database.prepare(sql);
  if (reuseSeeded) {
    const marker = prepare("SELECT format FROM benchmark_metadata").get();
    const rows = prepare(
      "SELECT COUNT(*) AS count FROM benchmark_rows WHERE id = value AND id BETWEEN 0 AND 999"
    ).get();
    if (marker?.format !== "nile-benchmark-v1" || rows.count !== ROW_COUNT) {
      database.close();
      throw Error("Invalid preseeded benchmark database");
    }
  } else {
    database.exec(
      "CREATE TABLE benchmark_metadata (format TEXT NOT NULL); INSERT INTO benchmark_metadata VALUES ('nile-benchmark-v1')"
    );
    database.exec(
      "CREATE TABLE benchmark_rows (id INTEGER PRIMARY KEY, value INTEGER NOT NULL, writes INTEGER NOT NULL DEFAULT 0)"
    );
    const insert = prepare(
      "INSERT INTO benchmark_rows (id, value) VALUES (?, ?)"
    );
    database.exec("BEGIN IMMEDIATE");
    Array.from({ length: ROW_COUNT }, (_, value) => insert.run(value, value));
    database.exec("COMMIT");
  }
  const select = prepare(
    "SELECT value, writes FROM benchmark_rows WHERE id = ?"
  );
  const update = prepare("UPDATE benchmark_rows SET writes = ? WHERE id = ?");
  const execute = ({ payload, action }) => {
    if (workload === "sqlite-read") {
      const row = select.get(payload.value);
      return { id: payload.id, value: row.value + 1, action };
    }
    // Every successful call commits a real counter increment. The response uses
    // immutable row data so correctness remains verifiable under concurrency.
    database.exec("BEGIN IMMEDIATE");
    const row = select.get(payload.value);
    update.run(row.writes + 1, payload.value);
    database.exec("COMMIT");
    return { id: payload.id, value: row.value + 1, action };
  };
  return {
    execute,
    close: () => database.close(),
    metadata: {
      workload,
      reuseSeeded,
      storage: "sqlite",
      databasePath: path,
      driver: runtime === "bun" ? "bun:sqlite" : "node:sqlite",
      runtime,
      runtimeVersion: process.versions.bun ?? process.versions.node,
      sqliteVersion: prepare("SELECT sqlite_version() AS version").get()
        .version,
      rows: ROW_COUNT,
      journalMode: prepare("PRAGMA journal_mode").get().journal_mode,
      synchronous: prepare("PRAGMA synchronous").get().synchronous,
      sqliteSynchronous,
      transaction:
        workload === "sqlite-read-write"
          ? "BEGIN IMMEDIATE; SELECT; UPDATE; COMMIT"
          : "SELECT",
      setup: reuseSeeded
        ? "Worker opens validated benchmark-only seed; shared WAL file; preparation excluded"
        : "Fresh file; 1000 seeded rows; preparation excluded from request timing",
    },
  };
}
