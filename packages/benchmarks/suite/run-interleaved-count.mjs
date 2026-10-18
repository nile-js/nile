import {
  readFile,
  writeFile,
  mkdir,
  mkdtemp,
  rename,
  readdir,
} from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readCountConfig } from "./shared/count-config.mjs";
import { readCpuTopology } from "./shared/cpu-topology.mjs";
import { waitForQuietHost } from "./shared/host-load.mjs";
import {
  captureClientSnapshot,
  assertResumeConfiguration,
} from "./shared/count-resume.mjs";
import { executeCountTrial } from "./shared/count-trial.mjs";
import {
  selectCountCells,
  createInterleavedSchedule,
  countCellKey,
  summarizeInterleavedCells,
  validateCountRound,
} from "./shared/interleaved-count.mjs";
import { renderReport } from "./shared/count-report.mjs";

const suitePath = dirname(fileURLToPath(import.meta.url));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

/** Keep the existing config validation while allowing an explicit corrective scenario selection. */
function readInterleavedArguments(args) {
  const index = args.indexOf("--selection");
  if (index < 0) return { config: readCountConfig(args) };
  if (
    !args[index + 1] ||
    args[index + 1].startsWith("--") ||
    args.lastIndexOf("--selection") !== index
  )
    throw Error("Use one --selection FILE");
  const remaining = [...args];
  const [, selectionPath] = remaining.splice(index, 2);
  return {
    config: readCountConfig(remaining),
    selectionPath: resolve(selectionPath),
  };
}

/** Atomically retain checkpoints, including each successful individual round. */
async function saveJson(path, value) {
  await writeFile(`${path}.pending`, `${JSON.stringify(value, null, 2)}\n`);
  await rename(`${path}.pending`, path);
}

/** Freeze every directly executed coordinator/helper source as well as the HTTP generator. */
async function captureProtocolSnapshot() {
  const snapshot = await captureClientSnapshot({ suitePath });
  const names = ["run-interleaved-count.mjs", "serve.mjs"];
  for (const directory of ["shared", "compiled", "adapters"]) {
    const entries = await readdir(join(suitePath, directory), {
      recursive: true,
      withFileTypes: true,
    });
    entries.sort((left, right) =>
      join(left.parentPath, left.name).localeCompare(
        join(right.parentPath, right.name)
      )
    );
    for (const entry of entries) {
      if (!entry.isFile() || !/\.(mjs|js|json|ts)$/.test(entry.name)) continue;
      const path = join(entry.parentPath, entry.name);
      snapshot.files[`benchmarks/suite/${path.slice(suitePath.length + 1)}`] =
        sha256(await readFile(path));
    }
  }
  for (const name of names)
    snapshot.files[`benchmarks/suite/${name}`] = sha256(
      await readFile(join(suitePath, name))
    );
  return snapshot;
}

/** Freeze actual native production images rather than trusting mutable Docker tag names. */
async function readEncoreImages(config) {
  if (!config.frameworks.includes("encore")) return {};
  const images = {};
  for (const mode of ["plain", "validated"]) {
    const { stdout } = await promisify(execFile)(
      "docker",
      [
        "image",
        "inspect",
        "--format",
        "{{.Id}}",
        `nile-benchmark-encore-${mode}:1.58.6`,
      ],
      { timeout: 10000 }
    );
    const id = stdout.trim();
    if (!/^sha256:[a-f0-9]{64}$/.test(id))
      throw Error("Invalid Encore image identity");
    images[mode] = id;
  }
  return images;
}

/** Reject protocol drift and revalidate every retained round rather than trusting its cached mean. */
async function restoreRounds({
  previous,
  config,
  provenance,
  outputPath,
  cells,
  snapshot,
}) {
  if (previous.ordering !== "interleaved-rounds")
    throw Error("Cannot resume the historical contiguous-repeat protocol here");
  assertResumeConfiguration({ previous, config, provenance });
  if (
    previous.config.quietIdlePercent !== config.quietIdlePercent ||
    JSON.stringify(previous.provenance.encoreImages) !==
      JSON.stringify(provenance.encoreImages)
  )
    throw Error("Quiet settings or native image identity changed");
  if (JSON.stringify(previous.selectedCells) !== JSON.stringify(cells))
    throw Error("Corrective selection changed");
  const original = JSON.parse(
    await readFile(join(outputPath, "source-at-initial-run.json"), "utf8")
  );
  if (JSON.stringify(original) !== JSON.stringify(snapshot))
    throw Error("Interleaved protocol source changed");
  const seen = new Set();
  for (const run of previous.runs.filter((run) => run.completed)) {
    const key = `${countCellKey(run)}/${run.round}`;
    if (seen.has(key)) throw Error("Duplicate completed round in checkpoint");
    seen.add(key);
    if (!cells.some((cell) => countCellKey(cell) === countCellKey(run)))
      throw Error("Unexpected checkpoint cell");
    if (run.results.includes("/") || run.results.includes("\\"))
      throw Error("Unsafe checkpoint path");
    validateCountRound({
      raw: JSON.parse(await readFile(join(outputPath, run.results), "utf8")),
      run,
      config,
    });
  }
  return {
    ...previous,
    config,
    completed: false,
    valid: false,
    failure: undefined,
    finishedAt: undefined,
    runs: previous.runs.filter((run) => run.completed),
    attemptNumber: previous.attemptNumber + 1,
  };
}

/** Schedule complete cross-framework passes and average three distinct, auditable rounds. */
async function runInterleavedCount() {
  const { config, selectionPath } = readInterleavedArguments(
    process.argv.slice(2)
  );
  if (process.versions.bun)
    throw Error(
      "Use Node for coordination; --runtime selects the server runtime"
    );
  const topology = await readCpuTopology(config);
  config.serverCpuList = topology[0].siblingIds.join(",");
  config.clientCpuList = topology[1].siblingIds.join(",");
  const selection = selectionPath
    ? JSON.parse(await readFile(selectionPath, "utf8"))
    : undefined;
  const cells = selectCountCells({ config, selection });
  const root = resolve(config.outputRoot ?? join(suitePath, "../results"));
  await mkdir(root, { recursive: true });
  const outputPath = config.resumePath
    ? resolve(config.resumePath)
    : await mkdtemp(
        join(
          root,
          `${new Date().toISOString().replaceAll(":", "-")}-${config.runtime}-interleaved-`
        )
      );
  const previous = config.resumePath
    ? JSON.parse(await readFile(join(outputPath, "count-summary.json"), "utf8"))
    : undefined;
  const isolationRoot =
    previous?.isolationRoot ??
    (await mkdtemp(join(tmpdir(), "nile-benchmark-interleaved-")));
  const [packageText, lock, nileText, artifact, snapshot] = await Promise.all([
    readFile(join(suitePath, "package.json"), "utf8"),
    readFile(join(suitePath, "bun.lock")),
    readFile(join(suitePath, "../../nile/package.json"), "utf8"),
    readFile(join(suitePath, "../../nile/dist/index.js")),
    captureProtocolSnapshot(),
  ]);
  const provenance = {
    cpuTopology: topology,
    nileVersion: JSON.parse(nileText).version,
    nileArtifactSha256: sha256(artifact),
    suiteLockSha256: sha256(lock),
    suitePackageSha256: sha256(packageText),
    node: process.version,
    encoreImages: await readEncoreImages(config),
  };
  const report = previous
    ? await restoreRounds({
        previous,
        config,
        provenance,
        outputPath,
        cells,
        snapshot,
      })
    : {
        startedAt: new Date().toISOString(),
        ordering: "interleaved-rounds",
        config,
        isolationRoot,
        provenance,
        selectedCells: cells,
        selection,
        completed: false,
        valid: false,
        cells: [],
        runs: [],
        quietSamples: [],
        attemptNumber: 1,
      };
  if (previous)
    await saveJson(
      join(outputPath, `attempt-${previous.attemptNumber}-summary.json`),
      previous
    );
  else await saveJson(join(outputPath, "source-at-initial-run.json"), snapshot);
  const checkpoint = async () => {
    await saveJson(join(outputPath, "count-summary.json"), report);
    await writeFile(join(outputPath, "summary.md"), renderReport(report));
  };
  const controller = new AbortController();
  const interrupt = () =>
    controller.abort(
      Error("Owner interrupted interleaved run; completed rounds retained")
    );
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  console.log(`Evidence: ${outputPath}`);
  await (async () => {
    for (const job of createInterleavedSchedule({ config, cells })) {
      controller.signal.throwIfAborted();
      if (
        report.runs.some(
          (run) =>
            run.completed &&
            run.round === job.round &&
            countCellKey(run) === countCellKey(job)
        )
      )
        continue;
      const prefix = `round${job.round}-${job.framework}-${job.operation}-${job.mode}-attempt${report.attemptNumber}`;
      console.log(`Waiting for quiet PC: ${prefix}`);
      await waitForQuietHost({
        minimumIdlePercent: config.quietIdlePercent,
        cpuIds: [...new Set(topology.flatMap((cpu) => cpu.siblingIds))],
        signal: controller.signal,
        onSample: async (sample) => {
          report.quietSamples.push({ trial: prefix, ...sample });
          await checkpoint();
        },
      });
      console.log(
        `Measuring: ${prefix} requests=${job.requestCounts[job.round - 1]}`
      );
      const run = await executeCountTrial({
        config,
        suitePath,
        outputPath,
        isolationRoot,
        provenance,
        dependencies: JSON.parse(packageText).dependencies,
        job,
        prefix,
        controller,
      });
      report.runs.push(run);
      report.cells = await summarizeInterleavedCells({
        cells,
        runs: report.runs,
        outputPath,
        config,
      });
      await checkpoint();
      console.log(
        `Completed: ${prefix} rate=${run.summary.throughput.mean.toFixed(1)}/s`
      );
    }
    report.totals = Object.fromEntries(
      config.frameworks.map((framework) => [
        framework,
        report.cells
          .filter((cell) => cell.framework === framework)
          .reduce((sum, cell) => sum + cell.measuredRequests, 0),
      ])
    );
    report.expectedTotals = Object.fromEntries(
      config.frameworks.map((framework) => [
        framework,
        cells
          .filter((cell) => cell.framework === framework)
          .reduce(
            (sum, cell) =>
              sum +
              cell.requestCounts.reduce((total, count) => total + count, 0),
            0
          ),
      ])
    );
    if (
      !report.cells.every((cell) => cell.completed) ||
      Object.entries(report.totals).some(
        ([framework, count]) => count !== report.expectedTotals[framework]
      )
    )
      throw Error("Incomplete interleaved matrix or request budget");
    controller.signal.throwIfAborted();
    report.completed = true;
    report.valid = true;
  })()
    .then(undefined, (error) => {
      report.failure = error instanceof Error ? error.message : String(error);
      process.exitCode = 1;
    })
    .finally(() => {
      process.removeListener("SIGINT", interrupt);
      process.removeListener("SIGTERM", interrupt);
    });
  report.finishedAt = new Date().toISOString();
  await checkpoint();
  console.log(
    `Finished: complete=${report.completed}, valid=${report.valid}, evidence=${outputPath}`
  );
}

await runInterleavedCount().then(undefined, (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
