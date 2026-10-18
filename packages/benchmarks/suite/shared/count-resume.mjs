import { readFile, readdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { summarizeScenario } from "./matrix-summary.mjs";

/** Freeze only client runtime sources so resumed server cells use the same generator. */
export async function captureClientSnapshot({ suitePath }) {
  const directory = resolve(suitePath, "../harness");
  const names = (await readdir(directory)).filter(
    (name) => name.endsWith(".mjs") && !name.endsWith(".test.mjs")
  );
  const files = {};
  for (const name of names)
    files[`benchmarks/harness/${name}`] = createHash("sha256")
      .update(await readFile(join(directory, name)))
      .digest("hex");
  return { files };
}

/** Require identical measured settings before retaining any completed cells. */
export function assertResumeConfiguration({ previous, config, provenance }) {
  const fields = [
    "runtime",
    "clientRuntime",
    "sqliteSynchronous",
    "frameworks",
    "requestBudget",
    "requestCounts",
    "concurrency",
    "warmupSeconds",
    "rounds",
    "seed",
    "serverCpuList",
    "clientCpuList",
    "nileRevision",
  ];
  if (previous.completed)
    throw Error("Completed comparisons cannot be resumed");
  for (const field of fields) {
    if (
      JSON.stringify(previous.config[field]) !== JSON.stringify(config[field])
    )
      throw Error(`Resume configuration changed: ${field}`);
  }
  for (const field of [
    "nileArtifactSha256",
    "suiteLockSha256",
    "suitePackageSha256",
    "node",
  ]) {
    if (previous.provenance[field] !== provenance[field])
      throw Error(`Resume artifact changed: ${field}`);
  }
}

/** Recheck raw evidence and a frozen client before skipping previously completed work. */
export async function prepareCountResume({
  previous,
  config,
  provenance,
  outputPath,
  suitePath,
}) {
  assertResumeConfiguration({ previous, config, provenance });
  const snapshot = JSON.parse(
    await readFile(join(outputPath, "source-at-initial-run.json"), "utf8")
  );
  if (
    !Object.keys(snapshot.files ?? {}).some(
      (path) =>
        path.startsWith("benchmarks/harness/") &&
        path.endsWith(".mjs") &&
        !path.endsWith(".test.mjs")
    )
  )
    throw Error("Missing frozen client source hashes");
  for (const [path, expected] of Object.entries(snapshot.files)) {
    if (
      !path.startsWith("benchmarks/harness/") ||
      !path.endsWith(".mjs") ||
      path.endsWith(".test.mjs")
    )
      continue;
    const source = await readFile(resolve(suitePath, "../..", path));
    const actual = createHash("sha256").update(source).digest("hex");
    if (actual !== expected)
      throw Error(`Cannot combine runs with a changed load generator: ${path}`);
  }
  const completed = previous.cells.filter((cell) => cell.completed);
  const identities = new Set();
  for (const cell of completed) {
    const key = `${cell.framework}/${cell.operation}/${cell.mode}`;
    if (identities.has(key)) throw Error(`Duplicate completed cell: ${key}`);
    identities.add(key);
    if (!cell.results || basename(cell.results) !== cell.results)
      throw Error("Unsafe result path in checkpoint");
    const raw = JSON.parse(
      await readFile(join(outputPath, cell.results), "utf8")
    );
    const rows = summarizeScenario(raw);
    const warmups = raw.trials.filter(
      (trial) =>
        trial.phase === "warmup" &&
        trial.valid &&
        trial.framework === cell.framework
    );
    if (
      warmups.length !== config.rounds ||
      new Set(warmups.map((trial) => trial.round)).size !== config.rounds
    )
      throw Error(`Incomplete warmup evidence: ${key}`);
    if (
      raw.manifest.frameworks.length !== 1 ||
      raw.manifest.frameworks[0].name !== cell.framework ||
      raw.manifest.workload.operation !== cell.operation ||
      raw.manifest.workload.mode !== cell.mode ||
      JSON.stringify(raw.manifest.requestCounts) !==
        JSON.stringify(cell.requestCounts)
    )
      throw Error(`Checkpoint workload identity changed: ${key}`);
    const count = raw.trials
      .filter((trial) => trial.phase === "measured")
      .reduce((sum, trial) => sum + trial.counters.requests, 0);
    if (
      !raw.completed ||
      rows.length !== 1 ||
      !rows[0].valid ||
      count !== cell.measuredRequests ||
      count !== cell.expectedRequests
    )
      throw Error(`Completed evidence failed revalidation: ${key}`);
  }
  const attemptNumber = (previous.attemptNumber ?? 1) + 1;
  return {
    ...previous,
    config,
    completed: false,
    valid: false,
    failure: undefined,
    cleanupFailure: undefined,
    finishedAt: undefined,
    cells: completed,
    attemptNumber,
    resumptions: [
      ...(previous.resumptions ?? []),
      {
        at: new Date().toISOString(),
        previousFailure: previous.failure,
        retainedCells: completed.length,
        incompleteCells: previous.cells.filter((cell) => !cell.completed),
      },
    ],
  };
}
