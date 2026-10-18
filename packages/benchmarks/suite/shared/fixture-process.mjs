import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { join } from "node:path";
import { finished } from "node:stream/promises";
import { safeTry } from "../../harness/codecs.mjs";

/** Run one owned process and retain complete streams without inspecting other programs. */
export function spawnLogged({ executable, args, cwd, outputPath, prefix }) {
  const stdout = createWriteStream(join(outputPath, `${prefix}.stdout.log`), {
    flags: "wx",
  });
  const stderr = createWriteStream(join(outputPath, `${prefix}.stderr.log`), {
    flags: "wx",
  });
  const child = spawn(executable, args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const exited = Promise.withResolvers();
  const closed = Promise.withResolvers();
  child.stdout.pipe(stdout);
  child.stderr.pipe(stderr);
  const drained = Promise.all([finished(stdout), finished(stderr)]);
  drained.catch(() => {});
  child.once("error", exited.reject);
  const failStream = (error) => {
    child.kill("SIGTERM");
    exited.reject(error);
  };
  stdout.on("error", failStream);
  stderr.on("error", failStream);
  child.once("exit", (code, signal) => exited.resolve({ code, signal }));
  child.once("close", () => closed.resolve());
  // Startup failures are consumed by the caller, including before it awaits exit.
  exited.promise.catch(() => {});
  return {
    child,
    exit: exited.promise,
    closed: closed.promise.then(() => drained),
    stdoutLog: `${prefix}.stdout.log`,
    stderrLog: `${prefix}.stderr.log`,
  };
}

/** Stop only a child we created, drain its evidence streams, and bound cleanup time. */
export async function stopOwnedProcess(entry) {
  if (entry.child.exitCode === null && entry.child.signalCode === null) {
    entry.child.kill("SIGTERM");
    const timer = setTimeout(() => entry.child.kill("SIGKILL"), 10000);
    await entry.closed;
    clearTimeout(timer);
    return;
  }
  await entry.closed;
}

/** Start a single native fixture on its assigned physical CPU core and await actual readiness. */
export async function startSuiteFixture({
  config,
  suitePath,
  outputPath,
  cell,
  prefix,
  databasePath,
  signal,
}) {
  const args = [
    "--cpu-list",
    config.serverCpuList ?? String(config.serverCpu),
    config.runtime === "bun" ? "bun" : process.execPath,
    join(suitePath, "serve.mjs"),
    "--framework",
    cell.framework,
    "--runtime",
    config.runtime,
    "--mode",
    cell.mode,
    "--workload",
    cell.operation,
    "--sqlite-synchronous",
    config.sqliteSynchronous,
    "--port",
    "4100",
  ];
  if (databasePath) args.push("--database-path", databasePath);
  const entry = spawnLogged({
    executable: "taskset",
    args,
    cwd: suitePath,
    outputPath,
    prefix,
  });
  const ready = Promise.withResolvers();
  const abort = () => {
    ready.reject(signal.reason);
    void stopOwnedProcess(entry).then(undefined, ready.reject);
  };
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  const timer = setTimeout(
    () => ready.reject(Error(`Startup timeout: ${prefix}`)),
    60000
  );
  let pending = "";
  entry.telemetry = [];
  entry.child.stdout.on("data", (chunk) => {
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
        ready.reject(Error(`Malformed readiness: ${prefix}`));
        continue;
      }
      if (marker === "BENCHMARK_TELEMETRY ") entry.telemetry.push(parsed.data);
      else ready.resolve(parsed.data);
    }
  });
  entry.exit.then(
    ({ code, signal }) =>
      ready.reject(Error(`Fixture exited (${code}, ${signal}): ${prefix}`)),
    ready.reject
  );
  const result = await ready.promise.then(
    (data) => ({ status: true, data }),
    (error) => ({
      status: false,
      message: error instanceof Error ? error.message : String(error),
    })
  );
  clearTimeout(timer);
  signal?.removeEventListener("abort", abort);
  if (!result.status) {
    await stopOwnedProcess(entry);
    throw Error(result.message);
  }
  entry.ready = result.data;
  return entry;
}

/** Keep the external generator on a different physical core from the server. */
export async function runHarnessProcess({
  config,
  suitePath,
  outputPath,
  prefix,
  manifestPath,
  resultsPath,
  signal,
}) {
  const entry = spawnLogged({
    executable: "taskset",
    args: [
      "--cpu-list",
      config.clientCpuList ?? String(config.clientCpu),
      config.clientRuntime === "bun" ? "bun" : process.execPath,
      join(suitePath, "../harness/run.mjs"),
      "--manifest",
      manifestPath,
      "--output",
      resultsPath,
    ],
    cwd: suitePath,
    outputPath,
    prefix,
  });
  let abortedStop;
  const abort = () => {
    abortedStop = stopOwnedProcess(entry);
  };
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  const result = await entry.exit.finally(async () => {
    signal?.removeEventListener("abort", abort);
    await (abortedStop ?? stopOwnedProcess(entry));
  });
  if (result.code !== 0)
    throw Error(`Harness failed (${result.code}, ${result.signal}): ${prefix}`);
  return { ...result, stdoutLog: entry.stdoutLog, stderrLog: entry.stderrLog };
}
