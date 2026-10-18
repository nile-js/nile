import test from "node:test";
import assert from "node:assert/strict";
import { describeFramework, renderReport } from "../shared/count-report.mjs";

const valid = () => ({
  cell: { framework: "nile", operation: "sqlite-read", mode: "validated" },
  ready: {
    framework: "nile",
    workloadMetadata: {
      workload: "sqlite-read",
      sqliteSynchronous: "normal",
      synchronous: 1,
    },
    runtime: "bun",
    runtimeVersion: "1.4.2",
    mode: "validated",
    port: 4100,
    nodeEnvironment: "production",
  },
  config: {
    runtime: "bun",
    sqliteSynchronous: "normal",
    nileRevision: "9f5a173",
  },
  provenance: { nileVersion: "0.0.17", nileArtifactSha256: "artifact-proof" },
  dependencies: {},
});

test("comparison refuses a readiness record with different workload, runtime or actual durability", () => {
  const fixture = valid();
  assert.match(describeFramework(fixture).version, /artifact-proof/);
  for (const ready of [
    { ...fixture.ready, runtime: "node" },
    { ...fixture.ready, port: 4110 },
    {
      ...fixture.ready,
      workloadMetadata: {
        ...fixture.ready.workloadMetadata,
        workload: "sqlite-read-write",
      },
    },
    {
      ...fixture.ready,
      workloadMetadata: { ...fixture.ready.workloadMetadata, synchronous: 2 },
    },
  ])
    assert.throws(() => describeFramework({ ...fixture, ready }));
});

test("targeted result report states actual budget and full durability without claiming a million", () => {
  const report = renderReport({
    config: { requestBudget: 18000, sqliteSynchronous: "full" },
    completed: false,
    valid: false,
    cells: [
      { framework: "nile", operation: "sqlite-read-write", mode: "plain" },
    ],
  });
  assert.match(report, /18000 measured requests/);
  assert.match(report, /synchronous FULL/);
  assert.match(report, /incomplete/);
});
