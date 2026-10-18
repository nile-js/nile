import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { safeTry } from "slang-ts";
import { createWorkload } from "./workload-store.mjs";
import { spawnLogged } from "./fixture-process.mjs";

const executeFile = promisify(execFile);
const BASE_IMAGE =
  "node@sha256:85e31dc0dcafd6754ca56b6abe73360f10278b38bb70153bb2b61dbb8d1c481e";
const METADATA_FORMAT =
  "{{json .Id}} {{json .Image}} {{json .State.Pid}} {{json .HostConfig.CpusetCpus}} {{json .HostConfig.CpuQuota}} {{json .HostConfig.NetworkMode}} {{json .Config.Entrypoint}}";

/** Execute Docker without a shell; errors fail setup rather than entering measurements. */
async function runDocker(args, { signal, timeout = 60000 } = {}) {
  return executeFile("docker", args, {
    signal,
    timeout,
    maxBuffer: 1024 * 1024,
  });
}

/** A missing auto-removed container is stopped; daemon failures must remain visible. */
async function isOwnedContainerRunning(containerName) {
  const inspected = await safeTry(async () =>
    (
      await runDocker(
        ["inspect", "--format", "{{json .State.Running}}", containerName],
        { timeout: 5000 }
      )
    ).stdout.trim()
  );
  if (!inspected.isErr) return inspected.value === "true";
  if (/No such (?:object|container)/i.test(inspected.error)) return false;
  throw Error(
    `Cannot verify owned Encore container cleanup: ${inspected.error}`
  );
}

/** Stop the container itself and verify exit before terminating an attached CLI. */
async function stopEncoreContainer({ containerName, entry }) {
  if (await isOwnedContainerRunning(containerName)) {
    await safeTry(
      async () =>
        await runDocker(["stop", "--time", "10", containerName], {
          timeout: 15000,
        })
    );
    if (await isOwnedContainerRunning(containerName))
      await runDocker(["kill", containerName], { timeout: 5000 });
    if (await isOwnedContainerRunning(containerName))
      throw Error(
        "Owned Encore container remained running after forced cleanup"
      );
  }
  let closed = false;
  entry.closed.then(() => {
    closed = true;
  });
  for (const signal of [null, "SIGTERM", "SIGKILL"]) {
    if (signal && !closed) entry.child.kill(signal);
    await Promise.race([entry.closed, delay(signal ? 2000 : 5000)]);
    if (closed) break;
  }
  if (!closed)
    throw Error("Owned Docker client did not exit after its container stopped");
  // A cancelled Docker run may create its container after our first inspection.
  if (await isOwnedContainerRunning(containerName))
    await runDocker(["kill", containerName], { timeout: 5000 });
  if (await isOwnedContainerRunning(containerName))
    throw Error("Owned Encore container survived attached-client cleanup");
}

/** Validate the real native endpoint before considering the container ready. */
async function awaitEncoreReady(entry, signal) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    signal?.throwIfAborted();
    if (entry.child.exitCode !== null || entry.child.signalCode !== null)
      throw Error("Encore production container exited before readiness");
    const requested = await safeTry(async () =>
      fetch("http://127.0.0.1:4100/actions/action-0", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: 17, value: 999 }),
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(10000)])
          : AbortSignal.timeout(10000),
      }).catch((error) => {
        throw Error(error.cause?.code ?? error.name);
      })
    );
    if (!requested.isErr) {
      const response = requested.value;
      if (response.status !== 200)
        throw Error(`Encore startup HTTP ${response.status}`);
      const output = await response.json();
      if (output.id !== 17 || output.value !== 1000 || output.action !== 0)
        throw Error("Encore startup response mismatch");
      return;
    }
    // Retry only requests known not to reach the listener. An ambiguous failure
    // must not repeat a potentially committed SQLite readiness write.
    if (requested.error !== "ECONNREFUSED")
      throw Error(`Encore startup request failed: ${requested.error}`);
    await delay(200, undefined, { signal });
  }
  throw Error("Encore production readiness timeout");
}

/** Start a genuine compiled Encore fixture with explicit, isolated storage configuration. */
export async function startEncoreFixture({
  config,
  suitePath,
  outputPath,
  cell,
  prefix,
  databasePath,
  isolationRoot,
  signal,
}) {
  if (config.runtime !== "node" || !["plain", "validated"].includes(cell.mode))
    throw Error(
      "Encore primary fixtures require Node and plain/common-Zod mode"
    );
  signal?.throwIfAborted();
  const started = performance.now();
  const seeded = await createWorkload({
    workload: cell.operation,
    databasePath,
    runtime: "node",
    sqliteSynchronous: config.sqliteSynchronous,
  });
  const workloadMetadata = seeded.metadata;
  seeded.close();
  const runtimeConfigPath = join(
    isolationRoot,
    `${prefix}-encore-runtime.json`
  );
  await writeFile(
    runtimeConfigPath,
    `${JSON.stringify({ workload: cell.operation, databasePath, isolationRoot, sqliteSynchronous: config.sqliteSynchronous })}\n`,
    { flag: "wx" }
  );
  const image = `nile-benchmark-encore-${cell.mode}:1.58.6`;
  const containerName = `nile-benchmark-${randomUUID()}`;
  const args = [
    "run",
    "--rm",
    "--name",
    containerName,
    "--network",
    "host",
    "--cpuset-cpus",
    config.serverCpuList ?? String(config.serverCpu),
    "--mount",
    `type=bind,source=${runtimeConfigPath},target=/tmp/nile-benchmark-runtime.json,readonly`,
    "--mount",
    `type=bind,source=${isolationRoot},target=${isolationRoot}`,
    "--env",
    "ENCORE_LISTEN_ADDR=127.0.0.1:4100",
    "--env",
    "PORT=4100",
    "--env",
    "ENCORE_RUNTIME_LOG=error",
    "--env",
    "ENCORE_LOG=Off",
    "--env",
    "NODE_ENV=production",
    image,
  ];
  const entry = spawnLogged({
    executable: "docker",
    args,
    cwd: suitePath,
    outputPath,
    prefix,
  });
  let stopped = false;
  const telemetry = [];
  /** Stop only this uniquely named owned container, then drain its attached log streams. */
  const stop = async () => {
    if (stopped) return;
    const inspected = await safeTry(async () =>
      (
        await runDocker(
          ["inspect", "--format", METADATA_FORMAT, containerName],
          { timeout: 5000 }
        )
      ).stdout.trim()
    );
    if (!inspected.isErr)
      telemetry.push({
        container: inspected.value,
        sampledAt: new Date().toISOString(),
      });
    const stats = await safeTry(async () =>
      (
        await runDocker(
          ["stats", "--no-stream", "--format", "{{json .}}", containerName],
          { timeout: 5000 }
        )
      ).stdout.trim()
    );
    if (!stats.isErr) telemetry.push({ dockerStats: stats.value });
    await stopEncoreContainer({ containerName, entry });
    stopped = true;
    if (databasePath) {
      const { DatabaseSync } = await import("node:sqlite");
      const observer = new DatabaseSync(databasePath, { readOnly: true });
      const row = observer
        .prepare(
          "SELECT SUM(writes) AS totalWrites, COUNT(*) AS rows FROM benchmark_rows"
        )
        .get();
      telemetry.push({
        storageCounters: { totalWrites: row.totalWrites, rows: row.rows },
      });
      observer.close();
    }
    await writeFile(
      join(outputPath, `${prefix}-container-telemetry.json`),
      `${JSON.stringify(telemetry, null, 2)}\n`
    );
  };
  const initialized = await safeTry(async () => {
    await awaitEncoreReady(entry, signal);
    const runtime = await runDocker(
      [
        "exec",
        containerName,
        "node",
        "-p",
        "JSON.stringify({node:process.versions.node})",
      ],
      { signal }
    );
    const runtimeVersion = JSON.parse(runtime.stdout).node;
    if (runtimeVersion !== "24.16.0")
      throw Error(`Encore image Node version mismatch: ${runtimeVersion}`);
    const inspected = await runDocker(
      ["inspect", "--format", METADATA_FORMAT, containerName],
      { signal }
    );
    await writeFile(
      join(outputPath, `${prefix}-container-inspect.txt`),
      inspected.stdout
    );
    return {
      framework: "encore",
      runtime: "node",
      mode: cell.mode,
      port: 4100,
      operation: cell.operation,
      workload: cell.operation,
      workloadMetadata,
      sqliteSynchronous: config.sqliteSynchronous ?? "full",
      runtimeVersion,
      nodeEnvironment: "production",
      image,
      containerName,
      baseImage: BASE_IMAGE,
      serverCpu: config.serverCpu,
      cfsQuota: false,
      factoryAndListenMs: performance.now() - started,
      metadataSource: databasePath
        ? "Host fresh seed; workers reopen the same verified marked database through the shared operation helper"
        : "Shared 1000-row in-memory operation helper in Encore workers",
    };
  });
  if (initialized.isErr) {
    await stop();
    throw Error(initialized.error);
  }
  return { ready: initialized.value, telemetry, stop, exit: entry.exit };
}
