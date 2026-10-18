import test from "node:test";
import assert from "node:assert/strict";
import {
  allocateRequestBudget,
  readCountConfig,
} from "../shared/count-config.mjs";
import { compareHostCounters } from "../shared/host-load.mjs";

test("one million requests divide exactly across six cells and three complete repeats", () => {
  const budgets = allocateRequestBudget({ total: 1000000 });
  assert.equal(budgets.length, 6);
  assert.ok(budgets.every((cell) => cell.length === 3));
  assert.equal(
    budgets.flat().reduce((sum, count) => sum + count, 0),
    1000000
  );
  assert.equal(Math.max(...budgets.flat()) - Math.min(...budgets.flat()), 1);
  assert.throws(() => allocateRequestBudget({ total: 5399 }));
});

test("count protocol defaults to current Nile and native framework fixtures with three repeats", () => {
  const config = readCountConfig([], "production");
  assert.equal(config.requestBudget, 1000000);
  assert.equal(config.rounds, 3);
  assert.ok(config.frameworks.includes("encore"));
  assert.throws(() =>
    readCountConfig(["--framework", "nile-release"], "production")
  );
  assert.throws(() => readCountConfig([], "development"));
  assert.throws(() => readCountConfig(["--warmup", "1"], "production"));
  assert.throws(() => readCountConfig(["--server-cpu", "0"], "production"));
  assert.deepEqual(
    readCountConfig(
      ["--runtime", "bun", "--framework", "nile,hono,bun"],
      "production"
    ).frameworks,
    ["nile", "hono", "bun"]
  );
});

test("host idle evidence does not count I/O waiting as idle or hide swap traffic", () => {
  const before = {
    at: "a",
    total: 100,
    idle: 10,
    ioWait: 5,
    swapIn: 4,
    swapOut: 3,
  };
  const after = {
    at: "b",
    total: 200,
    idle: 80,
    ioWait: 25,
    swapIn: 7,
    swapOut: 8,
    availableKiB: 2000,
  };
  assert.deepEqual(compareHostCounters({ before, after }), {
    startedAt: "a",
    finishedAt: "b",
    idlePercent: 70,
    ioWaitPercent: 20,
    swapInPages: 3,
    swapOutPages: 5,
    availableKiB: 2000,
  });
});
