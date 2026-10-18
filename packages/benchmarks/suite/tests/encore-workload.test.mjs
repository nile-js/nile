import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createWorkload } from "../shared/workload-store.mjs";
import {
  createEncoreWorkload,
  readEncoreWorkloadConfig,
} from "../shared/encore-workload.mjs";

/** Exercise the same marked host seed and worker connection used by production Encore. */
for (const workload of ["memory-read", "sqlite-read", "sqlite-read-write"]) {
  test(`Encore mounted config selects actual ${workload} business work`, async () => {
    const isolationRoot = mkdtempSync(
      join(tmpdir(), "nile-benchmark-encore-test-")
    );
    const databasePath = join(isolationRoot, "fixture.sqlite");
    const configPath = join(isolationRoot, "runtime.json");
    const host = await createWorkload({
      workload,
      databasePath,
      runtime: "node",
    });
    host.close();
    writeFileSync(
      configPath,
      JSON.stringify({ workload, databasePath, isolationRoot })
    );
    const worker = await createEncoreWorkload({ configPath });
    assert.deepEqual(
      worker.execute({ payload: { id: 4, value: 999 }, action: 299 }),
      { id: 4, value: 1000, action: 299 }
    );
    assert.equal(worker.metadata.workload, workload);
    if (workload !== "memory-read") {
      assert.equal(worker.metadata.reuseSeeded, true);
      assert.equal(worker.metadata.journalMode, "wal");
      assert.equal(worker.metadata.synchronous, 2);
      const { DatabaseSync } = await import("node:sqlite");
      const observer = new DatabaseSync(databasePath, { readOnly: true });
      assert.equal(
        observer
          .prepare("SELECT writes FROM benchmark_rows WHERE id = 999")
          .get().writes,
        workload === "sqlite-read-write" ? 1 : 0
      );
      observer.close();
    }
    worker.close();
  });
}

test("Encore config fails fast for malformed/unsupported inputs and missing isolation", () => {
  const directory = mkdtempSync(
    join(tmpdir(), "nile-benchmark-encore-config-")
  );
  const configPath = join(directory, "config.json");
  assert.deepEqual(readEncoreWorkloadConfig(configPath), {
    workload: "memory-read",
    runtime: "node",
    sqliteSynchronous: "full",
  });
  for (const text of [
    "{",
    "null",
    '{"workload":"unknown"}',
    '{"workload":"sqlite-read"}',
  ]) {
    writeFileSync(configPath, text);
    assert.throws(() => readEncoreWorkloadConfig(configPath));
  }
});

for (const [sqliteSynchronous, expectedPragma] of [
  ["full", 2],
  ["normal", 1],
]) {
  test(`Encore mounted ${sqliteSynchronous} sets actual worker durability`, async () => {
    const isolationRoot = mkdtempSync(
      join(tmpdir(), "nile-benchmark-encore-durability-")
    );
    const databasePath = join(isolationRoot, "fixture.sqlite");
    const configPath = join(isolationRoot, "runtime.json");
    const seed = await createWorkload({
      workload: "sqlite-read-write",
      databasePath,
      sqliteSynchronous,
    });
    seed.close();
    writeFileSync(
      configPath,
      JSON.stringify({
        workload: "sqlite-read-write",
        databasePath,
        isolationRoot,
        sqliteSynchronous,
      })
    );
    const worker = await createEncoreWorkload({ configPath });
    assert.equal(worker.metadata.synchronous, expectedPragma);
    assert.deepEqual(
      worker.execute({ payload: { id: 4, value: 4 }, action: 4 }),
      { id: 4, value: 5, action: 4 }
    );
    worker.close();
  });
}

test("Encore mounted config rejects unsupported durability", () => {
  const directory = mkdtempSync(
    join(tmpdir(), "nile-benchmark-encore-invalid-")
  );
  const configPath = join(directory, "runtime.json");
  writeFileSync(
    configPath,
    JSON.stringify({ workload: "memory-read", sqliteSynchronous: "off" })
  );
  assert.throws(() => readEncoreWorkloadConfig(configPath), /full or normal/);
});
