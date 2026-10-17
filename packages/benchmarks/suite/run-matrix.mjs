import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { readFile, writeFile, mkdir, mkdtemp } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { createHttpClient } from "../harness/http-client.mjs";
import { safeTry } from "../harness/codecs.mjs";
import {
  readMatrixConfig,
  createMatrixManifest,
} from "./shared/matrix-config.mjs";
import { preflightFramework } from "./shared/preflight.mjs";
import { renderMatrixSummary } from "./shared/matrix-summary.mjs";

const suitePath = dirname(fileURLToPath(import.meta.url));

/** Owner-only entry point: start isolated fixtures, preflight them, then measure each complete mode. */
async function runOwnerMatrix() {
  if (process.versions.bun)
    throw Error(
      "Run this coordinator with Node 24; --runtime bun selects Bun fixture children only"
    );
  const config = readMatrixConfig();
  const outputRoot = resolve(
    config.outputRoot ?? join(suitePath, "../results")
  );
  await mkdir(outputRoot, { recursive: true });
  const outputPath = await mkdtemp(
    join(
      outputRoot,
      `${new Date().toISOString().replaceAll(":", "-")}-${config.runtime}-${config.profile}-`
    )
  );
  console.log(`Evidence: ${outputPath}`);
  const [suitePackage, nilePackage, nileArtifact] = await Promise.all([
    readFile(join(suitePath, "package.json"), "utf8"),
    readFile(join(suitePath, "../../nile/package.json"), "utf8"),
    readFile(join(suitePath, "../../nile/dist/index.js")),
  ]);
  const dependencies = JSON.parse(suitePackage).dependencies;
  const currentNileVersion = JSON.parse(nilePackage).version;
  const artifactSha256 = createHash("sha256")
    .update(nileArtifact)
    .digest("hex");
  const lock = await readFile(join(suitePath, "bun.lock"));
  const report = {
    startedAt: new Date().toISOString(),
    config,
    completed: false,
    valid: false,
    suiteLockSha256: createHash("sha256").update(lock).digest("hex"),
    currentNileArtifactSha256: artifactSha256,
    coordinatorRuntime: process.version,
    modes: [],
    servers: [],
    exclusions: [
      {
        name: "encore",
        reason:
          "Encore CLI/runtime is unavailable. Its native fixture is separate and must be run manually once the CLI is installed; no substitute server is measured.",
      },
    ],
  };
  const children = [];
  let harnessChild;
  let firstFailure;
  const fail = (error) => {
    firstFailure ??= error instanceof Error ? error : Error(String(error));
    harnessChild?.kill("SIGTERM");
  };
  const interrupt = () => {
    fail(
      Error("Owner interrupted the matrix; partial evidence is not publishable")
    );
    children.forEach(({ child }) => child.kill("SIGTERM"));
  };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);

  /** Preserve streams verbatim and collect structured readiness/telemetry separately. */
  function startFixture({ framework, mode, port }) {
    if (firstFailure) throw firstFailure;
    const prefix = `${mode}-${framework}`;
    const stdout = createWriteStream(join(outputPath, `${prefix}.stdout.log`), {
      flags: "wx",
    });
    const stderr = createWriteStream(join(outputPath, `${prefix}.stderr.log`), {
      flags: "wx",
    });
    const executable = config.runtime === "bun" ? "bun" : process.execPath;
    const child = spawn(
      executable,
      [
        join(suitePath, "serve.mjs"),
        "--framework",
        framework,
        "--mode",
        mode,
        "--runtime",
        config.runtime,
        "--port",
        String(port),
      ],
      { cwd: suitePath, stdio: ["ignore", "pipe", "pipe"] }
    );
    const ready = Promise.withResolvers();
    const exited = Promise.withResolvers();
    const entry = {
      child,
      expectedStop: false,
      exited: exited.promise,
      ready: ready.promise,
    };
    children.push(entry);
    const evidence = {
      framework,
      mode,
      port,
      pid: child.pid,
      telemetry: [],
      stdoutLog: `${prefix}.stdout.log`,
      stderrLog: `${prefix}.stderr.log`,
    };
    report.servers.push(evidence);
    let pending = "";
    let hasReady = false;
    const timer = setTimeout(
      () => ready.reject(Error(`Startup timeout: ${framework} (${mode})`)),
      60000
    );
    child.stdout.pipe(stdout);
    child.stderr.pipe(stderr);
    stdout.on("error", fail);
    stderr.on("error", fail);
    child.stdout.on("data", (chunk) => {
      pending += chunk.toString("utf8");
      const lines = pending.split("\n");
      pending = lines.pop();
      for (const line of lines) {
        const marker = ["BENCHMARK_READY ", "BENCHMARK_TELEMETRY "].find(
          (value) => line.startsWith(value)
        );
        if (!marker) continue;
        const parsed = safeTry(() => JSON.parse(line.slice(marker.length)));
        if (!parsed.status) {
          ready.reject(Error(`Malformed ${marker.trim()} from ${framework}`));
          continue;
        }
        if (marker === "BENCHMARK_TELEMETRY ") {
          evidence.telemetry.push(parsed.data);
          continue;
        }
        if (hasReady) continue;
        hasReady = true;
        clearTimeout(timer);
        evidence.ready = parsed.data;
        ready.resolve(parsed.data);
      }
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      ready.reject(error);
      fail(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      evidence.exit = { code, signal, at: new Date().toISOString() };
      if (!hasReady)
        ready.reject(
          Error(
            `Fixture ${framework} exited before readiness (code=${code}, signal=${signal})`
          )
        );
      if (!entry.expectedStop)
        fail(
          Error(
            `Fixture ${framework} exited unexpectedly (code=${code}, signal=${signal})`
          )
        );
    });
    child.once("close", () => exited.resolve());
    return entry;
  }

  /** Stop every child even after startup, validation, measurement or owner interruption failures. */
  async function stopFixtures() {
    const entries = children.splice(0);
    await Promise.all(
      entries.map(async (entry) => {
        entry.expectedStop = true;
        if (entry.child.exitCode !== null || entry.child.signalCode !== null) {
          await entry.exited;
          return;
        }
        entry.child.kill("SIGTERM");
        const timer = setTimeout(() => entry.child.kill("SIGKILL"), 10000);
        await entry.exited;
        clearTimeout(timer);
      })
    );
  }

  /** Invoke the external generator with no framework setup work during measured trials. */
  async function measureMode({ mode, manifestPath, resultsPath }) {
    if (firstFailure) throw firstFailure;
    const stdout = createWriteStream(
      join(outputPath, `${mode}-harness.stdout.log`),
      { flags: "wx" }
    );
    const stderr = createWriteStream(
      join(outputPath, `${mode}-harness.stderr.log`),
      { flags: "wx" }
    );
    harnessChild = spawn(
      process.execPath,
      [
        join(suitePath, "../harness/run.mjs"),
        "--manifest",
        manifestPath,
        "--output",
        resultsPath,
      ],
      { cwd: suitePath, stdio: ["ignore", "pipe", "pipe"] }
    );
    harnessChild.stdout.pipe(stdout);
    harnessChild.stderr.pipe(stderr);
    stdout.on("error", fail);
    stderr.on("error", fail);
    const child = harnessChild;
    await new Promise((resolveExit, rejectExit) => {
      child.once("error", rejectExit);
      child.once("close", (code, signal) =>
        code === 0
          ? resolveExit()
          : rejectExit(
              Error(
                `Harness ${mode} failed (code=${code}, signal=${signal}); no ranking is valid`
              )
            )
      );
    });
    harnessChild = undefined;
    if (firstFailure) throw firstFailure;
  }

  const execute = async () => {
    for (const mode of ["plain", "validated"]) {
      const modeEvidence = { mode, preflight: [], completed: false };
      report.modes.push(modeEvidence);
      const readyServers = [];
      for (const [index, framework] of config.frameworks.entries()) {
        const entry = startFixture({ framework, mode, port: 4100 + index });
        readyServers.push(await entry.ready);
      }
      const manifest = createMatrixManifest({
        config,
        mode,
        readyServers,
        dependencies,
        currentNileVersion,
        artifactSha256,
      });
      const manifestPath = join(outputPath, `${mode}-manifest.json`);
      const resultsPath = join(outputPath, `${mode}-results.json`);
      modeEvidence.manifest = `${mode}-manifest.json`;
      modeEvidence.results = `${mode}-results.json`;
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
        flag: "wx",
      });
      for (const framework of manifest.frameworks) {
        if (firstFailure) throw firstFailure;
        const client = createHttpClient({ concurrency: 1, timeoutSeconds: 5 });
        const result = await preflightFramework({
          framework,
          mode,
          request: client.request,
        }).finally(client.close);
        modeEvidence.preflight.push(result);
        await writeFile(
          join(outputPath, "suite-summary.json"),
          `${JSON.stringify(report, null, 2)}\n`
        );
      }
      console.log(
        `Preflight passed: ${mode}, ${config.frameworks.length} fixtures. Measuring ${config.profile} profile.`
      );
      await measureMode({ mode, manifestPath, resultsPath });
      const results = JSON.parse(await readFile(resultsPath, "utf8"));
      if (!results.completed || !results.valid)
        throw Error(`Incomplete or invalid measured results: ${mode}`);
      modeEvidence.completed = true;
      await stopFixtures();
    }
    report.completed = true;
    report.valid = true;
  };
  await execute().then(undefined, fail).finally(stopFixtures);
  process.removeListener("SIGINT", interrupt);
  process.removeListener("SIGTERM", interrupt);
  report.finishedAt = new Date().toISOString();
  if (firstFailure) {
    report.failure = firstFailure.message;
    report.valid = false;
    report.completed = false;
  }
  await writeFile(
    join(outputPath, "suite-summary.json"),
    `${JSON.stringify(report, null, 2)}\n`
  );
  const resultsByMode = {};
  for (const mode of report.modes) {
    if (!mode.results) continue;
    const text = await readFile(join(outputPath, mode.results), "utf8").then(
      (value) => value,
      () => null
    );
    const parsed = text ? safeTry(() => JSON.parse(text)) : null;
    if (parsed?.status) resultsByMode[mode.mode] = parsed.data;
  }
  await writeFile(
    join(outputPath, "summary.md"),
    renderMatrixSummary({ report, resultsByMode })
  );
  if (firstFailure) throw firstFailure;
  console.log(`Completed both modes; evidence: ${outputPath}`);
}

// This file starts processes/listeners only when the owner explicitly runs this entry point.
await runOwnerMatrix().then(undefined, (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
