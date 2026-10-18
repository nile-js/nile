import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHttpClient } from "../../harness/http-client.mjs";
import { preflightFramework } from "../shared/preflight.mjs";
import { spawnLogged, stopOwnedProcess } from "../shared/fixture-process.mjs";

const suitePath = dirname(dirname(fileURLToPath(import.meta.url)));

/** Verify native listening readiness, actual HTTP routes and shutdown without a timed load. */
for (const runtime of ["node", "bun"]) {
  for (const workload of ["memory-read", "sqlite-read", "sqlite-read-write"]) {
    for (const mode of ["plain", "validated"]) {
      test(
        `Elysia native HTTP ${runtime}/${workload}/${mode}`,
        { timeout: 30000 },
        async () => {
          const outputPath = mkdtempSync(
            join(tmpdir(), "nile-benchmark-elysia-http-")
          );
          const port = 4194;
          const args = [
            join(suitePath, "serve.mjs"),
            "--framework",
            "elysia",
            "--runtime",
            runtime,
            "--mode",
            mode,
            "--workload",
            workload,
            "--sqlite-synchronous",
            "normal",
            "--port",
            String(port),
          ];
          const databasePath = join(outputPath, "fixture.sqlite");
          if (workload !== "memory-read")
            args.push("--database-path", databasePath);
          const entry = spawnLogged({
            executable: "env",
            args: [
              "NODE_ENV=production",
              runtime === "node" ? process.execPath : "bun",
              ...args,
            ],
            cwd: suitePath,
            outputPath,
            prefix: "fixture",
          });
          const ready = Promise.withResolvers();
          let pending = "";
          const timer = setTimeout(
            () => ready.reject(Error("Fixture startup timeout")),
            15000
          );
          entry.child.stdout.on("data", (chunk) => {
            pending += chunk.toString();
            const lines = pending.split("\n");
            pending = lines.pop();
            for (const line of lines) {
              if (line.startsWith("BENCHMARK_READY "))
                ready.resolve(JSON.parse(line.slice(16)));
            }
          });
          entry.exit.then(
            (result) =>
              ready.reject(Error(`Premature fixture exit ${result.code}`)),
            ready.reject
          );
          const client = createHttpClient({
            concurrency: 1,
            timeoutSeconds: 5,
          });
          const run = async () => {
            const metadata = await ready.promise;
            clearTimeout(timer);
            assert.equal(metadata.runtime, runtime);
            assert.equal(metadata.workloadMetadata.workload, workload);
            // Request immediately after readiness: no delay/retry may mask a bind race.
            const result = await preflightFramework({
              framework: {
                name: "elysia",
                codec: "json",
                url: `http://127.0.0.1:${port}`,
                pathTemplate: "/actions/action-{action}",
              },
              mode,
              request: client.request,
            });
            assert.equal(result.validActions, 300);
            assert.equal(result.invalidCases, mode === "validated" ? 30 : 0);
          };
          await run().finally(async () => {
            clearTimeout(timer);
            client.close();
            await stopOwnedProcess(entry);
          });
          const exit = await entry.exit;
          assert.equal(
            exit.code,
            0,
            `Native server shutdown failed; logs: ${outputPath}`
          );
          assert.equal(exit.signal, null);
          if (workload === "sqlite-read-write") {
            const { DatabaseSync } = await import("node:sqlite");
            const observer = new DatabaseSync(databasePath, { readOnly: true });
            assert.equal(
              observer
                .prepare("SELECT SUM(writes) AS total FROM benchmark_rows")
                .get().total,
              300
            );
            observer.close();
          }
        }
      );
    }
  }
}
