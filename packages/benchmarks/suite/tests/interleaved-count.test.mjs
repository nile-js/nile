import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readCountConfig } from "../shared/count-config.mjs";
import {
  countCellKey,
  selectCountCells,
  createInterleavedSchedule,
  validateCountRound,
  summarizeInterleavedCells,
} from "../shared/interleaved-count.mjs";

const config = readCountConfig(
  ["--requests", "5400", "--framework", "nile,express"],
  "production"
);

/** Build three independent evidence files with distinct measured rates and actual round identities. */
async function createEvidence() {
  const outputPath = await mkdtemp(
    join(tmpdir(), "nile-interleaved-evidence-")
  );
  const cell = selectCountCells({ config })[0];
  const runs = [];
  const raws = [];
  for (const round of [1, 2, 3]) {
    const run = {
      ...cell,
      round,
      completed: true,
      results: `round-${round}.json`,
      databaseVerification: { storage: "memory", writes: 0 },
    };
    const raw = {
      completed: true,
      clientRuntime: { name: "bun", version: "test" },
      manifest: {
        rounds: 3,
        selectedRound: round,
        requestCounts: cell.requestCounts,
        frameworks: [
          { name: cell.framework, runtime: "node", version: "local" },
        ],
        workload: {
          operation: cell.operation,
          mode: cell.mode,
          concurrencies: [100],
        },
      },
      trials: ["warmup", "measured"].map((phase) => ({
        round,
        phase,
        framework: cell.framework,
        concurrency: 100,
        valid: true,
        actionCoverage: 300,
        counters: {
          requests: 300,
          failed: 0,
          requestBodyBytes: 3000,
          responseBodyBytes: 6000,
        },
        successfulPerSecond: round * 100,
        latency: { p95Ms: round, p99Ms: round * 2 },
      })),
    };
    await writeFile(join(outputPath, run.results), JSON.stringify(raw));
    runs.push(run);
    raws.push(raw);
  }
  return { outputPath, cell, runs, raws };
}

test("every framework finishes its first pass before any second or third pass", () => {
  const cells = selectCountCells({ config });
  const schedule = createInterleavedSchedule({ config, cells });
  assert.equal(schedule.length, 36);
  for (const round of [1, 2, 3]) {
    const block = schedule.slice((round - 1) * 12, round * 12);
    assert.ok(block.every((job) => job.round === round));
    assert.equal(new Set(block.map(countCellKey)).size, 12);
    for (const name of config.frameworks)
      assert.equal(block.filter((job) => job.framework === name).length, 6);
  }
  for (const name of config.frameworks)
    assert.equal(
      schedule
        .filter((job) => job.framework === name)
        .reduce((sum, job) => sum + job.requestCounts[job.round - 1], 0),
      5400
    );
  assert.deepEqual(schedule, createInterleavedSchedule({ config, cells }));
});

test("corrective selections are explicit, unique and retain original per-round budgets", () => {
  const cell = {
    framework: "nile",
    operation: "sqlite-read",
    mode: "validated",
  };
  const selected = selectCountCells({ config, selection: { cells: [cell] } });
  assert.deepEqual(selected[0].requestCounts, [300, 300, 300]);
  assert.equal(
    createInterleavedSchedule({ config, cells: selected }).length,
    3
  );
  assert.throws(
    () => selectCountCells({ config, selection: { cells: [cell, cell] } }),
    /duplicate/
  );
  assert.throws(
    () =>
      selectCountCells({
        config,
        selection: { cells: [{ ...cell, framework: "absent" }] },
      }),
    /unsupported/
  );
});

test("aggregation averages all three rounds and leaves partial work incomplete", async () => {
  const fixture = await createEvidence();
  const summarize = (runs) =>
    summarizeInterleavedCells({
      cells: [fixture.cell],
      runs,
      outputPath: fixture.outputPath,
      config,
    });
  const [complete] = await summarize(fixture.runs);
  assert.equal(complete.completed, true);
  assert.equal(complete.summary.throughput.mean, 200);
  assert.equal(complete.summary.throughput.min, 100);
  assert.equal(complete.summary.throughput.max, 300);
  assert.equal(complete.measuredRequests, 900);
  const [partial] = await summarize(fixture.runs.slice(0, 2));
  assert.equal(partial.completed, false);
  assert.equal(partial.summary.valid, false);
  await assert.rejects(
    summarize([...fixture.runs, fixture.runs[0]]),
    /Duplicate/
  );
});

test("raw evidence rejects wrong round, failed requests, missing warmup and incomplete coverage", async () => {
  const { runs, raws } = await createEvidence();
  const check = (raw) => validateCountRound({ raw, run: runs[0], config });
  check(raws[0]);
  const wrong = structuredClone(raws[0]);
  wrong.trials[1].round = 2;
  assert.throws(() => check(wrong), /Invalid/);
  const failed = structuredClone(raws[0]);
  failed.trials[1].counters.failed = 1;
  failed.trials[1].valid = false;
  assert.throws(() => check(failed), /Invalid/);
  const missing = structuredClone(raws[0]);
  missing.trials.shift();
  assert.throws(() => check(missing), /Invalid/);
  const coverage = structuredClone(raws[0]);
  coverage.trials[0].actionCoverage = 299;
  assert.throws(() => check(coverage), /Invalid/);
});

test("three-framework round ordering balances every position without crossing round boundaries", () => {
  const balanced = { ...config, frameworks: ["nile", "express", "fastify"] };
  const cells = selectCountCells({ config: balanced }).filter(
    (cell) => cell.operation === "memory-read" && cell.mode === "plain"
  );
  const jobs = createInterleavedSchedule({ config: balanced, cells });
  for (const position of [0, 1, 2])
    assert.equal(
      new Set(
        [jobs[position], jobs[position + 3], jobs[position + 6]].map(
          (job) => job.framework
        )
      ).size,
      3
    );
  assert.deepEqual(
    jobs.map((job) => job.round),
    [1, 1, 1, 2, 2, 2, 3, 3, 3]
  );
});
