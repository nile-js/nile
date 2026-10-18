import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readCountConfig } from "../shared/count-config.mjs";
import {
  captureClientSnapshot,
  prepareCountResume,
} from "../shared/count-resume.mjs";

/** Build independent checkpoint evidence; no framework servers or databases are needed. */
async function createEvidence() {
  const directory = await mkdtemp(join(tmpdir(), "nile-benchmark-resume-"));
  const suitePath = join(directory, "benchmarks/suite");
  const harnessPath = join(directory, "benchmarks/harness");
  await Promise.all([
    mkdir(suitePath, { recursive: true }),
    mkdir(harnessPath, { recursive: true }),
  ]);
  await writeFile(join(harnessPath, "client.mjs"), "export {};\n");
  const config = readCountConfig(
    ["--requests", "5400", "--framework", "nile"],
    "production"
  );
  const manifest = {
    rounds: 3,
    requestCounts: [300, 300, 300],
    frameworks: [{ name: "nile", runtime: "node", version: "local" }],
    workload: { operation: "memory-read", mode: "plain", concurrencies: [100] },
  };
  const raw = {
    completed: true,
    valid: true,
    manifest,
    trials: [1, 2, 3].flatMap((round) =>
      ["warmup", "measured"].map((phase) => ({
        round,
        phase,
        framework: "nile",
        concurrency: 100,
        valid: true,
        counters: {
          requests: 300,
          failed: 0,
          requestBodyBytes: 300,
          responseBodyBytes: 300,
        },
        successfulPerSecond: 100,
        latency: { p95Ms: 1, p99Ms: 2 },
      }))
    ),
  };
  const provenance = {
    nileArtifactSha256: "nile-hash",
    suiteLockSha256: "lock-hash",
    suitePackageSha256: "package-hash",
    node: "test-runtime",
  };
  const previous = {
    config,
    provenance,
    completed: false,
    cells: [
      {
        framework: "nile",
        operation: "memory-read",
        mode: "plain",
        requestCounts: [300, 300, 300],
        completed: true,
        results: "cell.json",
        measuredRequests: 900,
        expectedRequests: 900,
      },
      {
        framework: "nile",
        operation: "memory-read",
        mode: "validated",
        completed: false,
      },
    ],
    failure: "Fixture startup failed",
  };
  await writeFile(join(directory, "cell.json"), JSON.stringify(raw));
  await writeFile(
    join(directory, "source-at-initial-run.json"),
    JSON.stringify(await captureClientSnapshot({ suitePath }))
  );
  return {
    previous,
    config,
    provenance,
    outputPath: directory,
    suitePath,
    harnessPath,
    raw,
  };
}

test("resume retains only revalidated completed cells and preserves failed attempts", async () => {
  const fixture = await createEvidence();
  const resumed = await prepareCountResume(fixture);
  assert.equal(resumed.cells.length, 1);
  assert.equal(resumed.cells[0].measuredRequests, 900);
  assert.equal(resumed.attemptNumber, 2);
  assert.equal(resumed.resumptions[0].incompleteCells.length, 1);
  assert.equal(
    resumed.resumptions[0].previousFailure,
    "Fixture startup failed"
  );
  assert.equal(resumed.completed, false);
  assert.equal(fixture.previous.cells.length, 2);
});

test("resume refuses changed settings, artifacts or client source", async () => {
  const fixture = await createEvidence();
  await assert.rejects(
    prepareCountResume({
      ...fixture,
      config: { ...fixture.config, concurrency: 30 },
    }),
    /configuration changed/
  );
  await assert.rejects(
    prepareCountResume({
      ...fixture,
      provenance: { ...fixture.provenance, nileArtifactSha256: "new-build" },
    }),
    /artifact changed/
  );
  await writeFile(
    join(fixture.harnessPath, "client.mjs"),
    "export const changed = true;\n"
  );
  await assert.rejects(prepareCountResume(fixture), /changed load generator/);
});

test("resume rejects corrupted counts and incomplete warmup evidence", async () => {
  const fixture = await createEvidence();
  fixture.raw.trials.find(
    (trial) => trial.phase === "measured"
  ).counters.requests = 301;
  await writeFile(
    join(fixture.outputPath, "cell.json"),
    JSON.stringify(fixture.raw)
  );
  await assert.rejects(prepareCountResume(fixture), /revalidation/);
  fixture.raw.trials = fixture.raw.trials.filter(
    (trial) => trial.phase !== "warmup"
  );
  await writeFile(
    join(fixture.outputPath, "cell.json"),
    JSON.stringify(fixture.raw)
  );
  await assert.rejects(prepareCountResume(fixture), /warmup/);
});
