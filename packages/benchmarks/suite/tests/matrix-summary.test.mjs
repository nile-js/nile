import test from "node:test";
import assert from "node:assert/strict";
import {
  summarizeValues,
  summarizeScenario,
  renderMatrixSummary,
} from "../shared/matrix-summary.mjs";

/** Supply synthetic trial data solely to verify report arithmetic; this is not benchmark evidence. */
function createResults() {
  const trials = Array.from({ length: 5 }, (_, index) => ({
    phase: "measured",
    framework: "fixture",
    concurrency: 100,
    valid: index !== 0,
    successfulPerSecond: [100, 200, 300, 400, 500][index],
    counters: {
      requests: 1000,
      failed: index === 0 ? 1 : 0,
      requestBodyBytes: 20000,
      responseBodyBytes: 40000,
    },
    latency: { p95Ms: 2 + index, p99Ms: 4 + index },
  }));
  return {
    completed: true,
    valid: false,
    manifest: {
      rounds: 5,
      frameworks: [{ name: "fixture", runtime: "node24", version: "test" }],
      workload: { concurrencies: [100] },
    },
    trials,
  };
}

test("median and range use every available trial and retain empty values gracefully", () => {
  assert.deepEqual(summarizeValues([500, 100, 200, 400, 300]), {
    mean: 300,
    median: 300,
    min: 100,
    max: 500,
  });
  assert.deepEqual(summarizeValues([2, 4]), {
    mean: 3,
    median: 3,
    min: 2,
    max: 4,
  });
  assert.equal(summarizeValues([null]), null);
});

test("invalid trials remain in ranges and failure totals rather than being filtered out", () => {
  const [row] = summarizeScenario(createResults());
  assert.equal(row.throughput.min, 100);
  assert.equal(row.throughput.median, 300);
  assert.equal(row.invalidTrials, 1);
  assert.equal(row.failures, 1);
  assert.equal(row.valid, false);
  assert.equal(row.p95.median, 4);
  assert.equal(row.p99.median, 6);
  assert.equal(row.requestBodyBytesPerOp, 20);
  assert.equal(row.responseBodyBytesPerOp, 40);
});

test("Markdown shows incomplete modes, insufficient trial counts and errors visibly", () => {
  const results = createResults();
  results.trials.pop();
  const report = {
    config: { profile: "development", runtime: "node" },
    completed: false,
    valid: false,
    failure: "Stopped",
    exclusions: [{ name: "encore", reason: "CLI unavailable" }],
  };
  const text = renderMatrixSummary({
    report,
    resultsByMode: { plain: results },
  });
  assert.match(text, /4\/5/);
  assert.match(text, /INCOMPLETE/);
  assert.match(text, /Development results are harness checks/);
  assert.match(text, /First failure: Stopped/);
  assert.match(text, /encore: CLI unavailable/);
  assert.match(text, /Failed requests/);
});

test("three counted repeats use arithmetic mean and preserve range and median", () => {
  const results = createResults();
  results.valid = true;
  results.manifest.rounds = 3;
  results.manifest.requestCounts = [1000, 1000, 1000];
  results.trials = results.trials.slice(0, 3).map((trial, index) => ({
    ...trial,
    round: index + 1,
    valid: true,
    successfulPerSecond: [100, 100, 1000][index],
    counters: { ...trial.counters, failed: 0 },
  }));
  const [row] = summarizeScenario(results);
  assert.deepEqual(row.throughput, {
    mean: 400,
    median: 100,
    min: 100,
    max: 1000,
  });
  assert.equal(row.requests, 3000);
  assert.equal(row.expectedRequests, 3000);
  assert.equal(row.valid, true);
  const text = renderMatrixSummary({
    report: {
      config: { profile: "publication", runtime: "node" },
      completed: true,
      valid: true,
      exclusions: [],
    },
    resultsByMode: { plain: results },
  });
  assert.match(text, /Successful req\/s mean/);
  assert.match(text, /400\.00 \[100\.00–1000\.00\]/);
  assert.match(text, /3\/3 \| VALID/);
});

test("count summaries reject budget mismatches and duplicate rounds even if flagged valid", () => {
  const results = createResults();
  results.manifest.rounds = 3;
  results.manifest.requestCounts = [1000, 1000, 1000];
  results.trials = results.trials.slice(0, 3).map((trial, index) => ({
    ...trial,
    round: index + 1,
    valid: true,
  }));
  results.trials[0].counters.requests = 999;
  assert.equal(summarizeScenario(results)[0].invalidTrials, 1);
  assert.equal(summarizeScenario(results)[0].valid, false);
  results.trials[0].counters.requests = 1000;
  results.trials[1].round = 1;
  assert.equal(summarizeScenario(results)[0].valid, false);
});

/** Give the selected third round a distinct budget to detect accidental index-zero use. */
function createSelectedRoundResults() {
  const results = createResults();
  results.completed = true;
  results.manifest.rounds = 3;
  results.manifest.selectedRound = 3;
  results.manifest.requestCounts = [300, 301, 302];
  results.trials = [
    {
      ...results.trials[1],
      round: 3,
      valid: true,
      counters: { ...results.trials[1].counters, requests: 302, failed: 0 },
    },
  ];
  return results;
}

test("selected round summary requires one trial with the original indexed budget", () => {
  const [row] = summarizeScenario(createSelectedRoundResults());
  assert.equal(row.expected, 1);
  assert.equal(row.trialCount, 1);
  assert.equal(row.expectedRequests, 302);
  assert.equal(row.requests, 302);
  assert.equal(row.valid, true);
});

test("selected round summary rejects a different round even if its own budget matches", () => {
  const results = createSelectedRoundResults();
  results.trials[0].round = 1;
  results.trials[0].counters.requests = 300;
  const [row] = summarizeScenario(results);
  assert.equal(row.invalidTrials, 1);
  assert.equal(row.valid, false);
});

test("selected round summary rejects wrong indexed counts, duplicates and foreign warmups", () => {
  const wrongBudget = createSelectedRoundResults();
  wrongBudget.trials[0].counters.requests = 300;
  assert.equal(summarizeScenario(wrongBudget)[0].valid, false);
  const duplicates = createSelectedRoundResults();
  duplicates.trials.push({ ...duplicates.trials[0] });
  assert.equal(summarizeScenario(duplicates)[0].valid, false);
  const warmup = createSelectedRoundResults();
  warmup.trials.push({ ...warmup.trials[0], phase: "warmup", round: 1 });
  assert.equal(summarizeScenario(warmup)[0].warmupFailures, 1);
  assert.equal(summarizeScenario(warmup)[0].valid, false);
});

test("complete three-round count summary still requires all original budgets", () => {
  const results = createSelectedRoundResults();
  delete results.manifest.selectedRound;
  const template = results.trials[0];
  results.trials = [1, 2, 3].map((round) => ({
    ...template,
    round,
    counters: {
      ...template.counters,
      requests: results.manifest.requestCounts[round - 1],
    },
  }));
  const [row] = summarizeScenario(results);
  assert.equal(row.expected, 3);
  assert.equal(row.expectedRequests, 903);
  assert.equal(row.valid, true);
});
