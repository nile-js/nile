import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorkload } from "../shared/workload-store.mjs";
import { verifyDatabaseWrites } from "../shared/verify-database.mjs";

test("post-run database verification proves every successful write including probes", async () => {
  const isolationRoot = await mkdtemp(
    join(tmpdir(), "nile-benchmark-verification-")
  );
  const databasePath = join(isolationRoot, "writes.sqlite");
  const store = await createWorkload({
    workload: "sqlite-read-write",
    databasePath,
  });
  for (let id = 0; id < 308; id += 1)
    store.execute({ payload: { id, value: id % 1000 }, action: id % 300 });
  store.close();
  const options = {
    databasePath,
    isolationRoot,
    operation: "sqlite-read-write",
    framework: "nile",
    results: { trials: [{ counters: { successful: 8 } }] },
  };
  const verification = await verifyDatabaseWrites(options);
  assert.equal(verification.writes, 308);
  assert.equal(verification.verified, true);
  await assert.rejects(
    verifyDatabaseWrites({ ...options, framework: "encore" }),
    /write count mismatch/
  );
  await assert.rejects(
    verifyDatabaseWrites({ ...options, operation: "sqlite-read" }),
    /write count mismatch/
  );
});

test("read-only database benchmark must leave zero persisted writes", async () => {
  const isolationRoot = await mkdtemp(
    join(tmpdir(), "nile-benchmark-verification-")
  );
  const databasePath = join(isolationRoot, "reads.sqlite");
  const store = await createWorkload({ workload: "sqlite-read", databasePath });
  store.execute({ payload: { id: 1, value: 10 }, action: 1 });
  store.close();
  const result = await verifyDatabaseWrites({
    databasePath,
    isolationRoot,
    operation: "sqlite-read",
    framework: "nile",
    results: { trials: [{ counters: { successful: 1 } }] },
  });
  assert.equal(result.writes, 0);
  assert.equal(result.verified, true);
});
