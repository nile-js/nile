import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { validateManifest, selectManifestRounds } from "./config.mjs";
import { runTrial } from "./trial.mjs";
import { OPERATIONS, readCountConfig } from "../suite/shared/count-config.mjs";

const framework = {
  name: "fixture",
  codec: "json",
  url: "http://127.0.0.1:4000",
  pathTemplate: "/actions/action-{action}",
  runtime: "node24",
  version: "test",
};

/** Construct count-mode configuration without listeners or real database work. */
function createManifest() {
  return {
    frameworks: [framework],
    workload: {
      name: "counted-memory-read",
      operation: "memory-read",
      mode: "plain",
      actionCount: 300,
      concurrencies: [100],
    },
    profile: "publication",
    requestCounts: [55556, 55556, 55555],
    warmupSeconds: 5,
    timeoutSeconds: 2,
    rounds: 3,
    seed: 42,
  };
}

/** Match transport output after asynchronous work, preserving ordinary body validation. */
async function respond(exchange) {
  await setImmediate();
  const body = JSON.stringify(exchange.expected);
  return {
    status: true,
    statusCode: 200,
    body,
    responseBytes: Buffer.byteLength(body),
  };
}

test("exact budgets support three publication rounds and explicit workload operations", () => {
  for (const operation of ["memory-read", "sqlite-read", "sqlite-read-write"]) {
    const manifest = createManifest();
    manifest.workload.operation = operation;
    assert.equal(validateManifest(manifest), manifest);
  }
});

test("every coordinator workload and allocated round budget is accepted by the harness", () => {
  const config = readCountConfig(["--framework", "nile"], "production");
  let cell = 0;
  for (const operation of OPERATIONS) {
    for (const mode of ["plain", "validated"]) {
      const manifest = createManifest();
      manifest.workload = { ...manifest.workload, operation, mode };
      manifest.requestCounts = config.requestCounts[cell++];
      assert.equal(validateManifest(manifest), manifest);
    }
  }
});

test("count manifests reject invalid budgets, timeouts, warmups and round counts", () => {
  const mutations = [
    (value) => {
      value.requestCounts = [300, 300];
    },
    (value) => {
      value.requestCounts = [300, 300, 299];
    },
    (value) => {
      value.requestCounts = [300, 300, 300.5];
    },
    (value) => {
      value.requestCounts = [300, Infinity, 300];
    },
    (value) => {
      value.requestCounts = [300, Number.MAX_SAFE_INTEGER + 1, 300];
    },
    (value) => {
      value.requestCounts = "300,300,300";
    },
    (value) => {
      value.timeoutSeconds = Infinity;
    },
    (value) => {
      value.timeoutSeconds = 0;
    },
    (value) => {
      value.warmupSeconds = 4;
    },
    (value) => {
      value.durationSeconds = NaN;
    },
    (value) => {
      value.rounds = 5;
    },
    (value) => {
      value.workload.operation = "unrecognized";
    },
  ];
  for (const mutate of mutations) {
    const manifest = createManifest();
    mutate(manifest);
    assert.throws(() => validateManifest(manifest));
  }
});

test("concurrent workers issue exactly a shared budget and consume every response", async () => {
  const seen = new Set();
  let active = 0;
  let peak = 0;
  const trial = await runTrial({
    framework,
    workload: createManifest().workload,
    concurrency: 100,
    requestCount: 307,
    durationSeconds: 0.000001,
    request: async (exchange) => {
      active += 1;
      peak = Math.max(peak, active);
      assert.equal(seen.has(exchange.expected.id), false);
      seen.add(exchange.expected.id);
      const response = await respond(exchange);
      active -= 1;
      return response;
    },
  });
  assert.equal(peak, 100);
  assert.equal(active, 0);
  assert.equal(seen.size, 307);
  assert.equal(Math.max(...seen), 306);
  assert.equal(trial.counters.requests, 307);
  assert.equal(trial.counters.successful, 307);
  assert.equal(trial.latency.count, 307);
  assert.equal(trial.actionCoverage, 300);
  assert.equal(trial.requestCount, 307);
  assert.equal(trial.operation, "memory-read");
  assert.equal(trial.valid, true);
  assert.equal(trial.drainSeconds, 0);
});

test("a budget smaller than concurrency still does not overshoot", async () => {
  const trial = await runTrial({
    framework,
    workload: createManifest().workload,
    concurrency: 300,
    requestCount: 17,
    request: respond,
  });
  assert.equal(trial.counters.requests, 17);
  assert.equal(trial.latency.count, 17);
  assert.equal(trial.actionCoverage, 17);
});

test("errors consume budget without retries and a wrong final response invalidates a trial", async () => {
  const trial = await runTrial({
    framework,
    workload: createManifest().workload,
    concurrency: 100,
    requestCount: 301,
    request: async (exchange) => {
      if (exchange.expected.id === 0) {
        await setImmediate();
        return { status: false, kind: "timeout", responseBytes: 0 };
      }
      if (exchange.expected.id === 300) {
        await setImmediate();
        return { status: true, statusCode: 200, body: "{}", responseBytes: 2 };
      }
      return respond(exchange);
    },
  });
  assert.equal(trial.counters.requests, 301);
  assert.equal(trial.counters.failed, 2);
  assert.equal(trial.counters.successful, 299);
  assert.equal(trial.counters.timeouts, 1);
  assert.equal(trial.counters.mismatches, 1);
  assert.equal(trial.latency.count, 301);
  assert.equal(trial.valid, false);
});

test("invalid direct trial budgets fail before sending requests", async () => {
  for (const requestCount of [0, -1, 1.5, Infinity]) {
    await assert.rejects(
      runTrial({
        framework,
        workload: createManifest().workload,
        concurrency: 100,
        requestCount,
        request: () => assert.fail("Must not issue a request"),
      })
    );
  }
});

test("selected count rounds retain original identities and full indexed budgets", () => {
  for (const selectedRound of [1, 2, 3]) {
    const manifest = { ...createManifest(), selectedRound };
    assert.equal(validateManifest(manifest), manifest);
    const rounds = selectManifestRounds(manifest);
    assert.deepEqual(rounds, [selectedRound]);
    assert.equal(
      manifest.requestCounts[rounds[0] - 1],
      selectedRound === 3 ? 55555 : 55556
    );
    assert.equal(manifest.rounds, 3);
  }
  assert.deepEqual(selectManifestRounds(createManifest()), [1, 2, 3]);
});

test("selectedRound refuses invalid selectors and duration mode", () => {
  for (const selectedRound of [0, 4, -1, 1.5, NaN, Infinity, "2", null]) {
    assert.throws(
      () => validateManifest({ ...createManifest(), selectedRound }),
      /selectedRound/
    );
  }
  const duration = {
    ...createManifest(),
    rounds: 5,
    durationSeconds: 30,
    selectedRound: 2,
  };
  delete duration.requestCounts;
  assert.throws(() => validateManifest(duration), /count mode only/);
  delete duration.selectedRound;
  assert.equal(validateManifest(duration), duration);
  assert.deepEqual(selectManifestRounds(duration), [1, 2, 3, 4, 5]);
});
