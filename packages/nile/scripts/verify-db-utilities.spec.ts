import { test } from "bun:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pgTable, text } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/pglite";
import { safeTry } from "slang-ts";
import { createNileServer } from "../nile/server";
import { createModel } from "../utils/db/create-model";
import { dbTry } from "../utils/db/db-try";

const probes = pgTable("utility_probes", { id: text("id").primaryKey() });

// Uses only the owner's approved disposable PGlite location; never application DB configuration.
test("real Drizzle/PGlite failures keep driver causes internal to Nile logs", async () => {
  const directory = await mkdtemp("/tmp/nile-db-utilities-");
  const database = new PGlite(directory);
  const logs: string[] = [];
  const write = (input: { data?: unknown }) => {
    logs.push(JSON.stringify(input.data));
    return "utility-log";
  };
  const logger = { info: write, warn: write, error: write };
  const app = await createNileServer({
    serverName: "DB utility verification",
    runtime: "bun",
    forceNewInstance: true,
    logServices: false,
    services: [{ name: "probe", description: "Probe", actions: [] }],
    resources: { logger },
  });
  const checked = await safeTry(async () => {
    await database.exec("CREATE TABLE utility_probes (id text PRIMARY KEY)");
    const model = createModel(probes, { name: "probe", db: drizzle(database) });
    assert.equal((await model.create({ data: { id: "one" } })).isOk, true);
    const failed = await model.create({ data: { id: "one" } });
    assert.equal(failed.isErr, true);
    assert.ok(logs.some((entry) => entry.includes("23505")));
    assert.ok(logs.every((entry) => !entry.includes("INSERT")));
    if (failed.isErr) {
      assert.ok(!failed.error.includes("INSERT"));
    }
    const guarded = await dbTry(
      () => database.exec("INSERT INTO utility_probes VALUES ('one')"),
      { logger, message: "Could not save probe" }
    );
    assert.equal(
      guarded.isErr && guarded.error,
      "[utility-log] Could not save probe"
    );
    const rows = await database.query("SELECT id FROM utility_probes");
    assert.equal(rows.rows.length, 1);
  });
  await app.lifecycle.shutdown();
  await database.close();
  if (checked.isErr) {
    throw new Error(String(checked.error));
  }
  console.log(`Database utility verification passed: ${directory}`);
}, 30_000);
