import { readFile, writeFile, mkdir, mkdtemp, rename } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { tmpdir, cpus } from "node:os";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { readCountConfig, OPERATIONS } from "./shared/count-config.mjs";
import {
  waitForQuietHost,
  readHostCounters,
  compareHostCounters,
} from "./shared/host-load.mjs";
import {
  startSuiteFixture,
  stopOwnedProcess,
  runHarnessProcess,
} from "./shared/fixture-process.mjs";
import { createHttpClient } from "../harness/http-client.mjs";
import { shuffleTrials } from "../harness/statistics.mjs";
import { preflightFramework } from "./shared/preflight.mjs";
import { summarizeScenario } from "./shared/matrix-summary.mjs";
import { describeFramework, renderReport } from "./shared/count-report.mjs";
import { readCpuTopology } from "./shared/cpu-topology.mjs";
import { verifyDatabaseWrites } from "./shared/verify-database.mjs";
import {
  prepareCountResume,
  captureClientSnapshot,
} from "./shared/count-resume.mjs";

const suitePath = dirname(fileURLToPath(import.meta.url));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

/** Save checkpoints atomically so interruption preserves complete prior cells. */
async function saveJson(path, value) {
  await writeFile(`${path}.pending`, `${JSON.stringify(value, null, 2)}\n`);
  await rename(`${path}.pending`, path);
}

/** Run exactly one fixture at a time, preserving evidence and closing it on every exit path. */
async function runCountMatrix() {
  const config = readCountConfig();
  const cpuTopology = await readCpuTopology(config);
  config.serverCpuList = cpuTopology[0].siblingIds.join(",");
  config.clientCpuList = cpuTopology[1].siblingIds.join(",");
  if (process.versions.bun)
    throw Error("Run coordinator with Node; --runtime selects fixture runtime");
  if (Math.max(config.serverCpu, config.clientCpu) >= cpus().length)
    throw Error("CPU ID exceeds available processors");
  const outputRoot = resolve(
    config.outputRoot ?? join(suitePath, "../results")
  );
  await mkdir(outputRoot, { recursive: true });
  const outputPath = config.resumePath
    ? resolve(config.resumePath)
    : await mkdtemp(
        join(
          outputRoot,
          `${new Date().toISOString().replaceAll(":", "-")}-${config.runtime}-count-`
        )
      );
  const previous = config.resumePath
    ? JSON.parse(await readFile(join(outputPath, "count-summary.json"), "utf8"))
    : null;
  const isolationRoot =
    previous?.isolationRoot ??
    (await mkdtemp(join(tmpdir(), "nile-benchmark-count-")));
  const [packageText, lock, nilePackageText, artifact] = await Promise.all([
    readFile(join(suitePath, "package.json"), "utf8"),
    readFile(join(suitePath, "bun.lock")),
    readFile(join(suitePath, "../../nile/package.json"), "utf8"),
    readFile(join(suitePath, "../../nile/dist/index.js")),
  ]);
  const provenance = {
    cpuTopology,
    nileVersion: JSON.parse(nilePackageText).version,
    nileArtifactSha256: sha256(artifact),
    suiteLockSha256: sha256(lock),
    suitePackageSha256: sha256(packageText),
    node: process.version,
  };
  const dependencies = JSON.parse(packageText).dependencies;
  const initialReport = {
    startedAt: new Date().toISOString(),
    config,
    isolationRoot,
    provenance,
    completed: false,
    valid: false,
    cells: [],
    quietSamples: [],
    attemptNumber: 1,
  };
  const report = previous
    ? await prepareCountResume({
        previous,
        config,
        provenance,
        outputPath,
        suitePath,
      })
    : initialReport;
  if (!previous)
    await saveJson(
      join(outputPath, "source-at-initial-run.json"),
      await captureClientSnapshot({ suitePath })
    );
  if (previous)
    await saveJson(
      join(outputPath, `attempt-${report.attemptNumber - 1}-summary.json`),
      previous
    );
  const checkpoint = async () => {
    await saveJson(join(outputPath, "count-summary.json"), report);
    await writeFile(join(outputPath, "summary.md"), renderReport(report));
  };
  const controller = new AbortController();
  const interrupt = () =>
    controller.abort(
      Error("Owner interrupted benchmark; partial evidence retained")
    );
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  console.log(`Evidence: ${outputPath}`);
  let active;
  const execute = async () => {
    const cells = OPERATIONS.flatMap((operation) =>
      ["plain", "validated"].map((mode) => ({ operation, mode }))
    );
    for (const [cellIndex, workload] of cells.entries()) {
      const order = shuffleTrials({
        trials: config.frameworks,
        seed: config.seed + cellIndex,
      });
      for (const framework of order) {
        controller.signal.throwIfAborted();
        if (
          report.cells.some(
            (cell) =>
              cell.completed &&
              cell.framework === framework &&
              cell.operation === workload.operation &&
              cell.mode === workload.mode
          )
        )
          continue;
        const cell = {
          ...workload,
          framework,
          requestCounts: config.requestCounts[cellIndex],
          completed: false,
        };
        report.cells.push(cell);
        const prefix = `${cellIndex}-${cell.operation}-${cell.mode}-${framework}-attempt${report.attemptNumber}`;
        console.log(`Waiting for quiet PC: ${prefix}`);
        await waitForQuietHost({
          minimumIdlePercent: config.quietIdlePercent,
          cpuIds: [
            ...new Set(
              provenance.cpuTopology.flatMap(({ siblingIds }) => siblingIds)
            ),
          ],
          signal: controller.signal,
          onSample: async (sample) => {
            report.quietSamples.push({ cell: prefix, ...sample });
            await checkpoint();
          },
        });
        const databasePath =
          cell.operation === "memory-read"
            ? undefined
            : join(isolationRoot, `${prefix}.sqlite`);
        const startOptions = {
          config,
          suitePath,
          outputPath,
          cell,
          prefix,
          databasePath,
          isolationRoot,
          signal: controller.signal,
        };
        active =
          framework === "encore"
            ? await (
                await import("./shared/encore-process.mjs")
              ).startEncoreFixture(startOptions)
            : await startSuiteFixture(startOptions);
        const entry = active;
        entry.exit?.then(
          () => {
            if (!entry.expectedStop)
              controller.abort(
                Error(`Fixture exited during measurement: ${prefix}`)
              );
          },
          (error) => controller.abort(error)
        );
        cell.ready = active.ready;
        const target = describeFramework({
          cell,
          ready: active.ready,
          config,
          provenance,
          dependencies,
        });
        const client = createHttpClient({ concurrency: 1, timeoutSeconds: 10 });
        cell.preflight = await preflightFramework({
          framework: target,
          mode: cell.mode,
          request: client.request,
        }).finally(client.close);
        const manifest = {
          profile: "publication",
          durationSeconds: 30,
          warmupSeconds: config.warmupSeconds,
          timeoutSeconds: 10,
          rounds: 3,
          requestCounts: cell.requestCounts,
          seed: config.seed + cellIndex,
          workload: {
            name: `300-actions-${cell.operation}-${cell.mode}`,
            operation: cell.operation,
            mode: cell.mode,
            actionCount: 300,
            concurrencies: [config.concurrency],
          },
          frameworks: [target],
          workloadMetadata: active.ready.workloadMetadata,
          provenance,
          requestedClientRuntime: config.clientRuntime,
        };
        const manifestPath = join(outputPath, `${prefix}-manifest.json`);
        const resultsPath = join(outputPath, `${prefix}-results.json`);
        await saveJson(manifestPath, manifest);
        cell.manifest = `${prefix}-manifest.json`;
        cell.results = `${prefix}-results.json`;
        console.log(
          `Measuring: ${prefix} requests=${cell.requestCounts.join("+")}`
        );
        const before = await readHostCounters();
        cell.loadSamples = [];
        let previous = before;
        let pendingSample = Promise.resolve();
        const monitor = setInterval(() => {
          pendingSample = pendingSample
            .then(async () => {
              const after = await readHostCounters();
              cell.loadSamples.push(
                compareHostCounters({ before: previous, after })
              );
              previous = after;
            })
            .catch((error) => controller.abort(error));
        }, 5000);
        await runHarnessProcess({
          config,
          suitePath,
          outputPath,
          prefix: `${prefix}-harness`,
          manifestPath,
          resultsPath,
          signal: controller.signal,
        }).finally(async () => {
          clearInterval(monitor);
          await pendingSample;
        });
        cell.hostLoad = compareHostCounters({
          before,
          after: await readHostCounters(),
        });
        const results = JSON.parse(await readFile(resultsPath, "utf8"));
        cell.summary = summarizeScenario(results)[0];
        cell.measuredRequests = results.trials
          .filter((trial) => trial.phase === "measured")
          .reduce((total, trial) => total + trial.counters.requests, 0);
        cell.expectedRequests = cell.requestCounts.reduce(
          (total, count) => total + count,
          0
        );
        if (
          !results.completed ||
          !cell.summary.valid ||
          cell.measuredRequests !== cell.expectedRequests
        )
          throw Error(`Invalid count/correctness: ${prefix}`);
        active.expectedStop = true;
        if (active.stop) await active.stop();
        else await stopOwnedProcess(active);
        cell.telemetry = active.telemetry;
        active = undefined;
        cell.databaseVerification = await verifyDatabaseWrites({
          databasePath,
          isolationRoot,
          operation: cell.operation,
          results,
          framework,
        });
        cell.completed = true;
        await checkpoint();
        console.log(
          `Completed: ${prefix} mean=${cell.summary.throughput.mean.toFixed(1)}/s`
        );
      }
    }
    report.totals = Object.fromEntries(
      config.frameworks.map((framework) => [
        framework,
        report.cells
          .filter((cell) => cell.framework === framework)
          .reduce((total, cell) => total + cell.measuredRequests, 0),
      ])
    );
    if (
      Object.values(report.totals).some(
        (count) => count !== config.requestBudget
      )
    )
      throw Error("Total request budget mismatch");
    controller.signal.throwIfAborted();
    report.completed = true;
    report.valid = true;
  };
  await execute()
    .then(undefined, (error) => {
      report.failure = error instanceof Error ? error.message : String(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      if (active) active.expectedStop = true;
      const cleanup = active?.stop
        ? active.stop()
        : active
          ? stopOwnedProcess(active)
          : Promise.resolve();
      await cleanup.then(undefined, (error) => {
        report.cleanupFailure =
          error instanceof Error ? error.message : String(error);
        report.completed = false;
        report.valid = false;
        process.exitCode = 1;
      });
      process.removeListener("SIGINT", interrupt);
      process.removeListener("SIGTERM", interrupt);
    });
  report.finishedAt = new Date().toISOString();
  await checkpoint();
  console.log(
    `Finished: complete=${report.completed}, valid=${report.valid}, evidence=${outputPath}`
  );
}

await runCountMatrix().then(undefined, (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
