import { spawnSync } from "node:child_process";
import { cp, mkdir, rename, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { safeTry } from "slang-ts";

const root = new URL("./", import.meta.url);
const compiled = new URL("compiled/", root);
const exists = await safeTry(() => stat(compiled));
if (exists.isOk) {
  const preserved = new URL(`trash/compiled-${Date.now()}/`, root);
  await mkdir(preserved, { recursive: true });
  await writeFile(
    new URL("intent.md", preserved),
    "Preserve the prior generated native benchmark fixtures before rebuilding. No source files are removed.\n"
  );
  await rename(compiled, new URL("compiled/", preserved));
}
const result = spawnSync(
  process.execPath,
  [
    fileURLToPath(new URL("../../nile/node_modules/typescript/bin/tsc", root)),
    "-p",
    fileURLToPath(new URL("tsconfig.json", root)),
  ],
  { stdio: "inherit" }
);
if (result.status !== 0)
  throw new Error("Benchmark native fixture compilation failed");
await cp(
  new URL("adapters/adonis/package.json", root),
  new URL("compiled/adonis/package.json", root)
);
