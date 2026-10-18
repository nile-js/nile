import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { shuffleTrials } from "../../harness/statistics.mjs";
import { OPERATIONS } from "./count-config.mjs";
import { summarizeScenario } from "./matrix-summary.mjs";

/** Identify a scenario independently of its repeat and execution position. */
export function countCellKey(cell) {
  return `${cell.framework}/${cell.operation}/${cell.mode}`;
}

/** Restrict corrections explicitly; an absent selection means the complete six-scenario matrix. */
export function selectCountCells({ config, selection }) {
  const all = config.frameworks.flatMap((framework) =>
    OPERATIONS.flatMap((operation, index) =>
      ["plain", "validated"].map((mode, offset) => ({
        framework,
        operation,
        mode,
        requestCounts: config.requestCounts[index * 2 + offset],
      }))
    )
  );
  if (!selection) return all;
  if (!Array.isArray(selection.cells) || !selection.cells.length)
    throw Error("Selection requires nonempty cells");
  const keys = selection.cells.map(countCellKey);
  if (
    new Set(keys).size !== keys.length ||
    keys.some((key) => !all.some((cell) => countCellKey(cell) === key))
  )
    throw Error("Selection has duplicate or unsupported cells");
  return all.filter((cell) => keys.includes(countCellKey(cell)));
}

/** Finish every selected framework's first pass before scheduling any second pass. */
export function createInterleavedSchedule({ config, cells }) {
  const base = shuffleTrials({ trials: config.frameworks, seed: config.seed });
  const stride = Math.max(1, Math.floor(base.length / config.rounds));
  return Array.from({ length: config.rounds }, (_, index) => index + 1).flatMap(
    (round) => {
      // Rotate a seeded order: for three frameworks, each occupies every position once.
      const offset = ((round - 1) * stride) % base.length;
      const frameworks = [...base.slice(offset), ...base.slice(0, offset)];
      return frameworks.flatMap((framework) =>
        cells
          .filter((cell) => cell.framework === framework)
          .map((cell) => ({ ...cell, round }))
      );
    }
  );
}

/** Recheck a raw single-round file before accepting it or retaining it after an interruption. */
export function validateCountRound({ raw, run, config }) {
  if (
    !Number.isInteger(run.round) ||
    run.round < 1 ||
    run.round > config.rounds
  )
    throw Error("Invalid round identity");
  const manifest = raw.manifest;
  const phases = raw.trials.filter(
    (trial) => trial.framework === run.framework
  );
  const warmups = phases.filter((trial) => trial.phase === "warmup");
  const measured = phases.filter((trial) => trial.phase === "measured");
  const row = summarizeScenario(raw)[0];
  if (
    !raw.completed ||
    !row?.valid ||
    manifest.selectedRound !== run.round ||
    manifest.rounds !== 3 ||
    manifest.frameworks.length !== 1 ||
    manifest.frameworks[0].name !== run.framework ||
    manifest.workload.operation !== run.operation ||
    manifest.workload.mode !== run.mode ||
    JSON.stringify(manifest.requestCounts) !==
      JSON.stringify(run.requestCounts) ||
    warmups.length !== 1 ||
    measured.length !== 1 ||
    raw.trials.length !== 2 ||
    phases.some(
      (trial) =>
        trial.round !== run.round ||
        !trial.valid ||
        trial.counters.failed !== 0 ||
        trial.actionCoverage !== 300 ||
        trial.concurrency !== config.concurrency
    ) ||
    row.requests !== run.requestCounts[run.round - 1] ||
    run.databaseVerification?.verified === false
  )
    throw Error(
      `Invalid interleaved round: ${countCellKey(run)} round ${run.round}`
    );
  if (
    run.operation !== "memory-read" &&
    (!run.databaseVerification?.verified ||
      run.databaseVerification.writes !==
        run.databaseVerification.expectedWrites)
  )
    throw Error("Missing persisted-write verification");
  return row;
}

/** Combine all three whole rounds, retaining raw sources and refusing duplicate or missing repeats. */
export async function summarizeInterleavedCells({
  cells,
  runs,
  outputPath,
  config,
}) {
  const summaries = [];
  for (const cell of cells) {
    const completed = runs.filter(
      (run) => run.completed && countCellKey(run) === countCellKey(cell)
    );
    if (new Set(completed.map((run) => run.round)).size !== completed.length)
      throw Error("Duplicate interleaved round");
    const reports = [];
    for (const run of completed) {
      if (basename(run.results) !== run.results)
        throw Error("Unsafe raw evidence path");
      const raw = JSON.parse(
        await readFile(join(outputPath, run.results), "utf8")
      );
      validateCountRound({ raw, run, config });
      reports.push(raw);
    }
    if (!reports.length) {
      summaries.push({
        ...cell,
        completed: false,
        measuredRequests: 0,
        runs: [],
      });
      continue;
    }
    const manifest = { ...reports[0].manifest };
    delete manifest.selectedRound;
    if (
      reports.some(
        (raw) =>
          JSON.stringify(raw.manifest.frameworks) !==
            JSON.stringify(manifest.frameworks) ||
          raw.manifest.serverImageId !== reports[0].manifest.serverImageId ||
          JSON.stringify(raw.clientRuntime) !==
            JSON.stringify(reports[0].clientRuntime)
      )
    )
      throw Error("Runtime identity changed between rounds");
    const raw = {
      manifest,
      completed: completed.length === config.rounds,
      trials: reports.flatMap((report) => report.trials),
    };
    const summary = summarizeScenario(raw)[0];
    summaries.push({
      ...cell,
      completed: raw.completed && summary.valid,
      measuredRequests: summary.requests,
      expectedRequests: cell.requestCounts.reduce(
        (sum, count) => sum + count,
        0
      ),
      summary,
      runs: completed.map((run) => ({
        round: run.round,
        results: run.results,
        databaseVerification: run.databaseVerification,
      })),
    });
  }
  return summaries;
}
