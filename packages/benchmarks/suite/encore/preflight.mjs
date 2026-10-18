import { readFile, writeFile } from "node:fs/promises";
import { createHttpClient } from "../../harness/http-client.mjs";
import { validateManifest } from "../../harness/config.mjs";
import { preflightFramework } from "../shared/preflight.mjs";

const [manifestPath, outputPath] = process.argv.slice(2);
if (!manifestPath || !outputPath) throw new Error("Provide manifest and preflight output paths");
const manifest = validateManifest(JSON.parse(await readFile(manifestPath, "utf8")));
const results = [];
for (const framework of manifest.frameworks) {
  const client = createHttpClient({ concurrency: 1, timeoutSeconds: 10 });
  const checked = await preflightFramework({ framework, mode: manifest.workload.mode, request: client.request }).finally(client.close);
  results.push(checked);
  console.log(`${framework.name}: ${checked.validActions} routes, ${checked.invalidCases} invalid cases passed`);
}
await writeFile(outputPath, `${JSON.stringify({ mode: manifest.workload.mode, results }, null, 2)}\n`, { flag: "wx" });
