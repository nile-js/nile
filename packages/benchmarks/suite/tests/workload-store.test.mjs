import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createWorkload,
  assertDatabasePath,
} from "../shared/workload-store.mjs";

for (const workload of ["memory-read", "sqlite-read", "sqlite-read-write"]) {
  test(`${workload}: deterministic results and real isolated storage`, async () => {
    const directory = mkdtempSync(join(tmpdir(), "nile-benchmark-unit-"));
    const databasePath = join(directory, "fixture.sqlite");
    const fixture = await createWorkload({ workload, databasePath });
    for (const value of [0, 500, 999]) {
      for (let repeat = 0; repeat < 3; repeat += 1) {
        assert.deepEqual(
          fixture.execute({ payload: { id: 42, value }, action: 299 }),
          {
            id: 42,
            value: value + 1,
            action: 299,
          }
        );
      }
    }
    if (workload !== "memory-read") {
      assert.equal(fixture.metadata.journalMode, "wal");
      assert.equal(fixture.metadata.synchronous, 2);
      const { DatabaseSync } = await import("node:sqlite");
      const observer = new DatabaseSync(databasePath, { readOnly: true });
      assert.equal(
        observer.prepare("SELECT COUNT(*) AS count FROM benchmark_rows").get()
          .count,
        1000
      );
      const writes = observer
        .prepare("SELECT writes FROM benchmark_rows WHERE id = 999")
        .get().writes;
      assert.equal(writes, workload === "sqlite-read-write" ? 3 : 0);
      observer.close();
    }
    fixture.close();
    if (workload !== "memory-read")
      assert.throws(() => assertDatabasePath(databasePath), /existing/);
  });
}

test("SQLite refuses application, missing-parent and nonisolated database paths", () => {
  assert.throws(() => assertDatabasePath("relative.sqlite"), /absolute/);
  assert.throws(() => assertDatabasePath("/tmp/fixture.sqlite"), /dedicated/);
  assert.throws(
    () => assertDatabasePath("/home/kizz/CODE/new-nile/fixture.sqlite"),
    /temporary/
  );
});

test("Encore-style workers may only reuse an explicit validated benchmark seed", async () => {
  const directory = mkdtempSync(join(tmpdir(), "nile-benchmark-workers-"));
  const databasePath = join(directory, "shared.sqlite");
  const seed = await createWorkload({
    workload: "sqlite-read-write",
    databasePath,
  });
  seed.close();
  await assert.rejects(
    createWorkload({
      workload: "sqlite-read-write",
      databasePath,
      reuseSeeded: true,
    }),
    /isolationRoot/
  );
  const options = {
    workload: "sqlite-read-write",
    databasePath,
    reuseSeeded: true,
    isolationRoot: directory,
  };
  const workerA = await createWorkload(options);
  const workerB = await createWorkload(options);
  const input = { payload: { id: 5, value: 5 }, action: 5 };
  assert.deepEqual(workerA.execute(input), workerB.execute(input));
  workerA.close();
  workerB.close();
  const { DatabaseSync } = await import("node:sqlite");
  const observer = new DatabaseSync(databasePath, { readOnly: true });
  assert.equal(
    observer.prepare("SELECT writes FROM benchmark_rows WHERE id=5").get()
      .writes,
    2
  );
  observer.close();
});

for (const [sqliteSynchronous, expectedPragma] of [
  ["full", 2],
  ["normal", 1],
]) {
  test(`SQLite ${sqliteSynchronous}: actual durability and committed mutation`, async () => {
    const directory = mkdtempSync(join(tmpdir(), "nile-benchmark-durability-"));
    const databasePath = join(directory, "fixture.sqlite");
    const store = await createWorkload({
      workload: "sqlite-read-write",
      databasePath,
      sqliteSynchronous,
    });
    assert.equal(store.metadata.synchronous, expectedPragma);
    assert.equal(store.metadata.sqliteSynchronous, sqliteSynchronous);
    assert.deepEqual(
      store.execute({ payload: { id: 7, value: 7 }, action: 7 }),
      { id: 7, value: 8, action: 7 }
    );
    store.close();
    const { DatabaseSync } = await import("node:sqlite");
    const observer = new DatabaseSync(databasePath, { readOnly: true });
    assert.equal(
      observer.prepare("SELECT writes FROM benchmark_rows WHERE id=7").get()
        .writes,
      1
    );
    observer.close();
  });
}

test("SQLite refuses unsupported durability before opening storage", async () => {
  await assert.rejects(
    createWorkload({ sqliteSynchronous: "off" }),
    /full or normal/
  );
});
