import test from "node:test";
import assert from "node:assert/strict";
import {
  readMatrixConfig,
  createMatrixManifest,
} from "../shared/matrix-config.mjs";
import {
  assertLoopbackTarget,
  isRejectedResponse,
  preflightFramework,
} from "../shared/preflight.mjs";
import { validateManifest } from "../../harness/config.mjs";
import { readConfig } from "../shared/config.mjs";

const ready = {
  framework: "nile",
  runtime: "node",
  nodeEnvironment: "production",
  runtimeVersion: "24.16.0",
  port: 4100,
  mode: "plain",
};
const configuration = () =>
  readMatrixConfig(
    ["--framework", "nile", "--nile-revision", "9f5a173"],
    "production"
  );

test("development and publication profiles retain all five rounds with explicit runtime support", () => {
  const dev = configuration();
  assert.deepEqual(dev.concurrencies, [100]);
  assert.equal(dev.rounds, 5);
  assert.equal(readMatrixConfig([], "production").frameworks.length, 9);
  assert.deepEqual(
    readMatrixConfig(["--runtime", "bun"], "production").frameworks,
    ["nile", "elysia", "effect"]
  );
  const publication = readMatrixConfig(
    ["--profile", "publication"],
    "production"
  );
  assert.deepEqual(publication.concurrencies, [1, 30, 100, 300]);
  assert.equal(publication.durationSeconds, 30);
  assert.equal(publication.warmupSeconds, 5);
  assert.throws(() =>
    readMatrixConfig(
      ["--profile", "publication", "--duration", "2"],
      "production"
    )
  );
  assert.throws(() =>
    readMatrixConfig(
      ["--runtime", "bun", "--framework", "express"],
      "production"
    )
  );
  assert.throws(() =>
    readMatrixConfig(["--framework", "encore"], "production")
  );
  assert.throws(() =>
    readMatrixConfig(["--framework", "nile,nile"], "production")
  );
});

test("published Nile is rejected by individual and matrix launch configuration", () => {
  assert.throws(() => readConfig(["--framework", "nile-release"], "production"));
  for (const runtime of ["node", "bun"]) {
    assert.throws(() =>
      readMatrixConfig(
        ["--runtime", runtime, "--framework", "nile-release"],
        "production"
      )
    );
  }
});

test("generated manifests identify artifact/source and fixed loopback endpoint", () => {
  const manifest = createMatrixManifest({
    config: configuration(),
    mode: "plain",
    readyServers: [ready],
    dependencies: {},
    currentNileVersion: "0.0.17",
    artifactSha256: "test-hash",
  });
  assert.equal(
    validateManifest(manifest).frameworks[0].url,
    "http://127.0.0.1:4100"
  );
  assert.match(manifest.frameworks[0].version, /9f5a173/);
  assert.match(manifest.frameworks[0].version, /test-hash/);
  assert.equal(manifest.frameworks[0].codec, "nile");
  assert.equal(manifest.exclusions[0].name, "encore");
  assert.throws(() =>
    createMatrixManifest({
      config: configuration(),
      mode: "plain",
      readyServers: [{ ...ready, mode: "validated" }],
      dependencies: {},
      currentNileVersion: "0.0.17",
      artifactSha256: "test",
    })
  );
});

test("preflight refuses remote, credentialed, alternate loopback and nonHTTP targets", () => {
  assertLoopbackTarget("http://127.0.0.1:4100");
  [
    "https://127.0.0.1",
    "http://localhost",
    "http://127.0.0.2",
    "http://user:secret@127.0.0.1",
    "http://example.com",
  ].forEach((url) => assert.throws(() => assertLoopbackTarget(url)));
});

test("validation rejection accepts native client failures but never server/transport failures", () => {
  assert.equal(
    isRejectedResponse({
      codec: "json",
      response: { status: true, statusCode: 422, body: "{}" },
    }),
    true
  );
  assert.equal(
    isRejectedResponse({
      codec: "nile",
      response: { status: true, statusCode: 200, body: '{"status":false}' },
    }),
    true
  );
  assert.equal(
    isRejectedResponse({
      codec: "json",
      response: { status: true, statusCode: 500, body: "{}" },
    }),
    false
  );
  assert.equal(
    isRejectedResponse({
      codec: "nile",
      response: { status: true, statusCode: 200, body: "bad-json" },
    }),
    false
  );
  assert.equal(
    isRejectedResponse({ codec: "json", response: { status: false } }),
    false
  );
});

test("pure injected preflight checks all 300 routes and 30 invalid inputs across first/middle/last actions", async () => {
  const framework = {
    name: "fixture",
    url: "http://127.0.0.1:4100",
    codec: "json",
    pathTemplate: "/actions/action-{action}",
  };
  let calls = 0;
  const request = async (exchange) => {
    calls += 1;
    if (calls > 300) return { status: true, statusCode: 422, body: "{}" };
    return {
      status: true,
      statusCode: 200,
      body: JSON.stringify(exchange.expected),
    };
  };
  const result = await preflightFramework({
    framework,
    mode: "validated",
    request,
  });
  assert.equal(result.status, true);
  assert.equal(result.validActions, 300);
  assert.equal(result.invalidCases, 30);
  assert.equal(calls, 330);
  await assert.rejects(
    preflightFramework({
      framework,
      mode: "plain",
      request: async () => ({
        status: true,
        statusCode: 200,
        body: '{"id":0,"value":1,"action":299}',
      }),
    }),
    /Preflight failed/
  );
});
