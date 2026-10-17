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
    median: 300,
    min: 100,
    max: 500,
  });
  assert.deepEqual(summarizeValues([2, 4]), { median: 3, min: 2, max: 4 });
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
