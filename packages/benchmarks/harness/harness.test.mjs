import test from "node:test";
import assert from "node:assert/strict";
import { createExchange, decodeResponse } from "./codecs.mjs";
import { readArguments, validateManifest } from "./config.mjs";
import { createLatencyRecorder, shuffleTrials } from "./statistics.mjs";
import { accountResponse, runTrial } from "./trial.mjs";

const framework = {
  name: "fixture",
  codec: "json",
  url: "http://127.0.0.1:4000",
  pathTemplate: "/actions/action-{action}",
  runtime: "Node24",
  version: "test",
};
const manifest = () => ({
  frameworks: [{ ...framework }],
  workload: {
    name: "300-actions",
    mode: "plain",
    actionCount: 300,
    concurrencies: [1, 30, 100, 300],
  },
  profile: "development",
  durationSeconds: 1,
  warmupSeconds: 1,
  timeoutSeconds: 2,
  rounds: 5,
  seed: 42,
});

test("codecs rotate 300 actions and retain the same payload and expected action", () => {
  const exchange = createExchange({
    framework,
    sequence: 1301,
    actionCount: 300,
  });
  assert.equal(exchange.url.pathname, "/actions/action-101");
  assert.deepEqual(JSON.parse(exchange.body), { id: 1301, value: 301 });
  assert.deepEqual(exchange.expected, { id: 1301, value: 302, action: 101 });
  const nile = createExchange({
    framework: { ...framework, codec: "nile", pathTemplate: "/api/services" },
    sequence: 1301,
    actionCount: 300,
  });
  assert.deepEqual(JSON.parse(nile.body), {
    intent: "execute",
    service: "bench",
    action: "action-101",
    payload: { id: 1301, value: 301 },
  });
});

test("native envelopes decode without hiding wrong actions or unsuccessful responses", () => {
  const expected = { id: 1, value: 2, action: 1 };
  const values = {
    json: expected,
    nile: { status: true, data: expected },
    trpc: { result: { data: expected } },
  };
  Object.entries(values).forEach(([codec, value]) =>
    assert.equal(
      decodeResponse({ codec, body: JSON.stringify(value), expected }).status,
      true
    )
  );
  assert.equal(
    decodeResponse({
      codec: "nile",
      body: JSON.stringify({ status: false, data: expected }),
      expected,
    }).status,
    false
  );
  assert.equal(
    decodeResponse({ codec: "json", body: "not-json", expected }).status,
    false
  );
  assert.equal(
    decodeResponse({
      codec: "json",
      body: JSON.stringify({ ...expected, action: 2 }),
      expected,
    }).status,
    false
  );
});

test("manifest rejects invalid protocols, routes, workloads and publication shortcuts", () => {
  assert.equal(validateManifest(manifest()).frameworks.length, 1);
  const mutations = [
    (value) => {
      value.frameworks[0].url = "file:///tmp/test";
    },
    (value) => {
      value.frameworks[0].url = "http://user:secret@localhost";
    },
    (value) => {
      value.frameworks[0].pathTemplate = "//external/action-{action}";
    },
    (value) => {
      value.frameworks[0].pathTemplate = "/fixed";
    },
    (value) => {
      value.frameworks.push({ ...framework });
    },
    (value) => {
      value.workload.actionCount = 1;
    },
    (value) => {
      value.workload.mode = "ambiguous";
    },
    (value) => {
      value.workload.concurrencies = [1000];
    },
    (value) => {
      value.rounds = 1;
    },
    (value) => {
      value.timeoutSeconds = 0;
    },
    (value) => {
      value.profile = "publication";
    },
  ];
  mutations.forEach((mutate) => {
    const value = manifest();
    mutate(value);
    assert.throws(() => validateManifest(value));
  });
  const publication = {
    ...manifest(),
    profile: "publication",
    durationSeconds: 30,
    warmupSeconds: 5,
  };
  assert.equal(validateManifest(publication).profile, "publication");
});

test("CLI requires explicit distinct options and rejects unsupported arguments", () => {
  assert.deepEqual(
    readArguments(["--manifest", "input.json", "--output", "output.json"]),
    { manifestPath: "input.json", outputPath: "output.json" }
  );
  assert.throws(() => readArguments([]));
  assert.throws(() =>
    readArguments(["--manifest", "input.json", "--wat", "output.json"])
  );
});

test("latency quantiles include every observation and describe upper bucket edges", () => {
  const recorder = createLatencyRecorder();
  assert.equal(recorder.snapshot().p99Ms, null);
  [0.11, 1.01, 2, 30.01].forEach(recorder.record);
  const result = recorder.snapshot();
  assert.equal(result.count, 4);
  assert.equal(result.p50Ms, 1.1);
  assert.equal(result.p95Ms, 30.1);
  assert.equal(result.p99Ms, 30.1);
  assert.equal(
    result.histogramTenthsMs.reduce((sum, [, count]) => sum + count, 0),
    4
  );
});

test("shuffle is deterministic, complete and seed-dependent", () => {
  const trials = Array.from({ length: 20 }, (_, index) => index);
  const shuffled = shuffleTrials({ trials, seed: 42 });
  assert.deepEqual(shuffled, shuffleTrials({ trials, seed: 42 }));
  assert.notDeepEqual(shuffled, shuffleTrials({ trials, seed: 43 }));
  assert.deepEqual(
    [...shuffled].sort((a, b) => a - b),
    trials
  );
});

test("injected adapter accounts timeout, transport, non200, mismatch and success without a listener", async () => {
  let clock = 0;
  let index = 0;
  const failures = [
    { status: false, kind: "timeout", responseBytes: 0 },
    { status: false, kind: "network", responseBytes: 0 },
    { status: false, kind: "oversized", responseBytes: 65537 },
    { status: true, statusCode: 500, body: "{}", responseBytes: 2 },
    { status: true, statusCode: 200, body: "{bad", responseBytes: 4 },
  ];
  const trial = await runTrial({
    framework,
    workload: manifest().workload,
    concurrency: 1,
    durationSeconds: 0.6,
    now: () => clock,
    request: async (exchange) => {
      clock += 100;
      return (
        failures[index++] ?? {
          status: true,
          statusCode: 200,
          body: JSON.stringify(exchange.expected),
          responseBytes: 33,
        }
      );
    },
  });
  assert.equal(trial.counters.requests, 6);
  assert.equal(trial.counters.failed, 5);
  assert.equal(trial.counters.successful, 1);
  assert.equal(trial.counters.timeouts, 1);
  assert.equal(trial.counters.networkErrors, 1);
  assert.equal(trial.counters.oversizedResponses, 1);
  assert.equal(trial.counters.non200, 1);
  assert.equal(trial.counters.mismatches, 2);
  assert.equal(trial.latency.count, 6);
  assert.equal(trial.valid, false);
  assert.ok(trial.counters.requestBodyBytes > 0);
  assert.equal(trial.counters.responseBodyBytes, 65576);
});

test("non200 with correct JSON still counts as failure without payload mismatch", () => {
  const counters = {
    requests: 0,
    successful: 0,
    failed: 0,
    requestBodyBytes: 0,
    responseBodyBytes: 0,
    non200: 0,
    mismatches: 0,
  };
  const exchange = createExchange({ framework, sequence: 0, actionCount: 300 });
  accountResponse({
    counters,
    codec: "json",
    exchange,
    response: {
      status: true,
      statusCode: 503,
      body: JSON.stringify(exchange.expected),
      responseBytes: 10,
    },
  });
  assert.equal(counters.failed, 1);
  assert.equal(counters.non200, 1);
  assert.equal(counters.mismatches, 0);
});
