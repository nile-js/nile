import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHttpClient } from "../../harness/http-client.mjs";
import { preflightFramework } from "./preflight.mjs";
import { describeFramework } from "./count-report.mjs";
import { summarizeScenario } from "./matrix-summary.mjs";
import {
  startSuiteFixture,
  stopOwnedProcess,
  runHarnessProcess,
} from "./fixture-process.mjs";
import { readHostCounters, compareHostCounters } from "./host-load.mjs";
import { verifyDatabaseWrites } from "./verify-database.mjs";

/** Execute one real, independently warmed round using the existing fixture and HTTP harness. */
export async function executeCountTrial({
  config,
  suitePath,
  outputPath,
  isolationRoot,
  provenance,
  dependencies,
  job,
  prefix,
  controller,
}) {
  const databasePath =
    job.operation === "memory-read"
      ? undefined
      : join(isolationRoot, `${prefix}.sqlite`);
  const options = {
    config,
    suitePath,
    outputPath,
    isolationRoot,
    cell: job,
    prefix,
    databasePath,
    signal: controller.signal,
  };
  const entry =
    job.framework === "encore"
      ? await (await import("./encore-process.mjs")).startEncoreFixture(options)
      : await startSuiteFixture(options);
  const result = { ...job, completed: false, ready: entry.ready };
  entry.exit?.then(
    () => {
      if (!entry.expectedStop)
        controller.abort(Error(`Fixture exited during measurement: ${prefix}`));
    },
    (error) => controller.abort(error)
  );
  const stop = async () => {
    entry.expectedStop = true;
    if (entry.stop) await entry.stop();
    else await stopOwnedProcess(entry);
    result.telemetry = entry.telemetry;
  };
  await (async () => {
    if (job.framework === "encore") {
      const metadata = await readFile(
        join(outputPath, `${prefix}-container-inspect.txt`),
        "utf8"
      );
      const imageId = metadata.match(/^"[^"]+"\s+"(sha256:[a-f0-9]{64})"/)?.[1];
      if (!imageId || imageId !== provenance.encoreImages[job.mode])
        throw Error("Encore production image changed");
      entry.ready.imageId = imageId;
    }
    const target = describeFramework({
      cell: job,
      ready: entry.ready,
      config,
      provenance,
      dependencies,
    });
    const client = createHttpClient({ concurrency: 1, timeoutSeconds: 10 });
    result.preflight = await preflightFramework({
      framework: target,
      mode: job.mode,
      request: client.request,
    }).finally(client.close);
    const manifest = {
      profile: "publication",
      durationSeconds: 30,
      warmupSeconds: config.warmupSeconds,
      timeoutSeconds: 10,
      rounds: 3,
      selectedRound: job.round,
      requestCounts: job.requestCounts,
      seed: config.seed + job.round,
      workload: {
        name: `300-actions-${job.operation}-${job.mode}`,
        operation: job.operation,
        mode: job.mode,
        actionCount: 300,
        concurrencies: [config.concurrency],
      },
      frameworks: [target],
      workloadMetadata: entry.ready.workloadMetadata,
      serverImageId: entry.ready.imageId,
      provenance,
      requestedClientRuntime: config.clientRuntime,
    };
    result.manifest = `${prefix}-manifest.json`;
    result.results = `${prefix}-results.json`;
    const manifestPath = join(outputPath, result.manifest);
    const resultsPath = join(outputPath, result.results);
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
      flag: "wx",
    });
    const before = await readHostCounters();
    result.loadSamples = [];
    let previous = before;
    let pendingSample = Promise.resolve();
    const monitor = setInterval(() => {
      pendingSample = pendingSample
        .then(async () => {
          const after = await readHostCounters();
          result.loadSamples.push(
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
    controller.signal.throwIfAborted();
    result.hostLoad = compareHostCounters({
      before,
      after: await readHostCounters(),
    });
    const raw = JSON.parse(await readFile(resultsPath, "utf8"));
    result.summary = summarizeScenario(raw)[0];
    result.measuredRequests = result.summary.requests;
    result.expectedRequests = job.requestCounts[job.round - 1];
    if (
      !raw.completed ||
      !result.summary.valid ||
      result.measuredRequests !== result.expectedRequests
    )
      throw Error(`Invalid round count/correctness: ${prefix}`);
    // Read the persisted DB only after the owning process has released its handles.
    await stop();
    result.databaseVerification = await verifyDatabaseWrites({
      databasePath,
      isolationRoot,
      operation: job.operation,
      results: raw,
      framework: job.framework,
    });
    result.completed = true;
  })().finally(async () => {
    if (!entry.expectedStop) await stop();
  });
  return result;
}
