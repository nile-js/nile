import { readFile, writeFile, rename } from "node:fs/promises";
import { cpus, totalmem, platform, arch, release, hostname } from "node:os";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import {
  readArguments,
  validateManifest,
  selectManifestRounds,
} from "./config.mjs";
import { createHttpClient } from "./http-client.mjs";
import { shuffleTrials } from "./statistics.mjs";
import { runTrial } from "./trial.mjs";

/** Save the entire evidence file after every warmup and measured trial, atomically. */
async function persistReport({ outputPath, report }) {
  const temporaryPath = `${outputPath}.pending`;
  await writeFile(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, {
    flag: "w",
  });
  await rename(temporaryPath, outputPath);
}

/** Drive user-started servers only; this runner never creates listeners or child processes. */
async function runBenchmark() {
  const { manifestPath, outputPath } = readArguments(process.argv.slice(2));
  const manifestText = await readFile(manifestPath, "utf8");
  const manifest = validateManifest(JSON.parse(manifestText));
  const isBunClient = Boolean(process.versions.bun);
  const nativeClient = isBunClient
    ? await import("./bun-http-client.mjs")
    : null;
  const createClient = nativeClient?.createBunHttpClient ?? createHttpClient;
  const clientRuntime = {
    name: isBunClient ? "bun" : "node",
    version: process.versions.bun ?? process.versions.node,
    versionSource: isBunClient
      ? "process.versions.bun"
      : "process.versions.node",
    transport: isBunClient ? "bun-native-fetch" : "node-http-agent",
    httpProtocol: "HTTP/1.1 on the suite's plain HTTP loopback targets",
    responseCompression: isBunClient
      ? "Accept-Encoding identity; automatic decompression disabled."
      : "No compression requested; response bytes consumed directly.",
    connectionPool: isBunClient
      ? "Native global keepalive pool spans repeats until this harness process exits; close aborts active requests only."
      : "Agent keepalive pool closes after each warmup/measured pair.",
    retries:
      "No application-level retries; native transport connection recovery semantics may differ.",
    ...(nativeClient
      ? { documentation: nativeClient.BUN_FETCH_DOCUMENTATION }
      : {}),
  };
  if (
    manifest.requestedClientRuntime &&
    manifest.requestedClientRuntime !== clientRuntime.name
  )
    throw Error("Requested and actual load-generator runtimes differ");
  const report = {
    schemaVersion: 1,
    startedAt: new Date().toISOString(),
    manifest,
    clientRuntime,
    manifestPath: resolve(manifestPath),
    manifestSha256: createHash("sha256").update(manifestText).digest("hex"),
    machine: {
      hostname: hostname(),
      platform: platform(),
      release: release(),
      arch: arch(),
      cpus: cpus().map(({ model, speed }) => ({ model, speedMHz: speed })),
      totalMemoryBytes: totalmem(),
      node: process.version,
      nativeRuntime: clientRuntime.name,
      nativeRuntimeVersion: clientRuntime.version,
      ...(isBunClient
        ? { nodeCompatibilityVersion: process.versions.node }
        : {}),
      nodeFieldSource: isBunClient
        ? "Bun's Node compatibility value; not a separate Node process"
        : "Actual Node process version",
      runtimeVersions: process.versions,
    },
    methodology: {
      load: "Closed-loop external HTTP/1.1, keepalive, one outstanding request per worker; response bodies fully consumed and checked.",
      latency:
        "Every request recorded; histogram ceilings in 0.1ms buckets, including failures. p50/p95/p99 upper bucket edges.",
      bytes:
        "Application request and response body bytes only. Includes protocol JSON envelopes, excludes HTTP headers/TCP/TLS overhead; attempted request bytes are counted on transport failures.",
      limitation:
        "Load generator may share the server machine. Results describe this workload and runtime, not production capacity or a universal framework ranking.",
      correctness:
        "No ranking generated. Any failed request or incomplete 300-action coverage invalidates a trial; warmup errors invalidate the overall run.",
      budget: manifest.requestCounts
        ? "Exact per-round measured request budgets; errors consume budget without retries. Warmup requests are additional and excluded from the budget."
        : "Duration-limited measurements; in-flight responses are drained before calculating throughput.",
    },
    trials: [],
    completed: false,
  };
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, {
    flag: "wx",
  });
  for (const round of selectManifestRounds(manifest)) {
    const trials = manifest.frameworks.flatMap((framework) =>
      manifest.workload.concurrencies.map((concurrency) => ({
        framework,
        concurrency,
      }))
    );
    const order = shuffleTrials({ trials, seed: manifest.seed + round });
    for (const { framework, concurrency } of order) {
      const client = createClient({
        concurrency,
        timeoutSeconds: manifest.timeoutSeconds,
      });
      const runPhases = async () => {
        for (const phase of ["warmup", "measured"]) {
          const result = await runTrial({
            framework,
            workload: manifest.workload,
            concurrency,
            durationSeconds:
              phase === "warmup"
                ? manifest.warmupSeconds
                : manifest.durationSeconds,
            requestCount:
              phase === "measured"
                ? manifest.requestCounts?.[round - 1]
                : undefined,
            request: client.request,
          });
          result.valid =
            result.valid &&
            result.actionCoverage === manifest.workload.actionCount;
          report.trials.push({
            round,
            phase,
            finishedAt: new Date().toISOString(),
            ...result,
          });
          await persistReport({ outputPath, report });
          console.log(
            `${phase} round=${round} ${framework.name} c=${concurrency}: ${result.successfulPerSecond.toFixed(1)}/s failures=${result.counters.failed} valid=${result.valid}`
          );
        }
      };
      await runPhases().finally(client.close);
    }
  }
  report.completed = true;
  report.finishedAt = new Date().toISOString();
  report.valid = report.trials.every((trial) => trial.valid);
  await persistReport({ outputPath, report });
  if (!report.valid) process.exitCode = 1;
}

await runBenchmark().then(undefined, (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
