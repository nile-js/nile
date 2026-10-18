import test from "node:test";
import assert from "node:assert/strict";
import { readConfig, readRuntimeEnvironment } from "../shared/config.mjs";
import {
  readMatrixConfig,
  createMatrixManifest,
} from "../shared/matrix-config.mjs";

test("config records the explicit runtime environment without reading application files", () => {
  assert.equal(typeof readRuntimeEnvironment, "function");
  assert.equal(
    readConfig(["--framework", "nile"], "production").nodeEnvironment,
    "production"
  );
  assert.equal(
    readConfig(["--framework", "nile"], "development").nodeEnvironment,
    "development"
  );
});

test("matrix rejects unset, development and test environments before fixture startup", () => {
  ["", "development", "test"].forEach((value) =>
    assert.throws(() => readMatrixConfig([], value), /NODE_ENV=production/)
  );
  assert.equal(
    readMatrixConfig([], "production").nodeEnvironment,
    "production"
  );
});

test("manifest refuses non-production readiness even when the coordinator requests production", () => {
  const inputs = {
    config: readMatrixConfig(["--framework", "nile"], "production"),
    mode: "plain",
    readyServers: [
      {
        framework: "nile",
        mode: "plain",
        runtime: "node",
        runtimeVersion: "24.16.0",
        port: 4100,
        nodeEnvironment: "development",
      },
    ],
    dependencies: {},
    currentNileVersion: "0.0.17",
    artifactSha256: "test",
  };
  assert.throws(() => createMatrixManifest(inputs), /Readiness/);
  inputs.readyServers[0].nodeEnvironment = "production";
  const manifest = createMatrixManifest(inputs);
  assert.equal(manifest.nodeEnvironment, "production");
  assert.equal(manifest.frameworks[0].nodeEnvironment, "production");
});

test("fixture SQLite durability defaults full and accepts normal explicitly", () => {
  assert.equal(
    readConfig(["--framework", "nile"], "production").sqliteSynchronous,
    "full"
  );
  assert.equal(
    readConfig(
      ["--framework", "nile", "--sqlite-synchronous", "normal"],
      "production"
    ).sqliteSynchronous,
    "normal"
  );
  assert.throws(
    () =>
      readConfig(
        ["--framework", "nile", "--sqlite-synchronous", "off"],
        "production"
      ),
    /full\|normal/
  );
});
