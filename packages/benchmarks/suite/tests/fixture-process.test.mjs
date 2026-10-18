import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnLogged, stopOwnedProcess } from "../shared/fixture-process.mjs";

test("owned process cleanup drains complete evidence streams before returning", async () => {
  const outputPath = await mkdtemp(join(tmpdir(), "nile-benchmark-child-"));
  const entry = spawnLogged({
    executable: process.execPath,
    args: [
      "-e",
      "process.stdout.write('verified-output');process.stderr.write('verified-error')",
    ],
    cwd: outputPath,
    outputPath,
    prefix: "normal",
  });
  const status = await entry.exit;
  await stopOwnedProcess(entry);
  assert.equal(status.code, 0);
  assert.equal(
    await readFile(join(outputPath, "normal.stdout.log"), "utf8"),
    "verified-output"
  );
  assert.equal(
    await readFile(join(outputPath, "normal.stderr.log"), "utf8"),
    "verified-error"
  );
});

test("failed spawn surfaces promptly and still permits cleanup", async () => {
  const outputPath = await mkdtemp(join(tmpdir(), "nile-benchmark-child-"));
  const entry = spawnLogged({
    executable: join(outputPath, "missing-executable"),
    args: [],
    cwd: outputPath,
    outputPath,
    prefix: "failed",
  });
  await assert.rejects(entry.exit, /ENOENT/);
  await stopOwnedProcess(entry);
});
