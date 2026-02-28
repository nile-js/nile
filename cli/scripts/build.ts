import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const outdir = join(import.meta.dir, "../dist");

// Bundle with bun
const result = await Bun.build({
  entrypoints: [join(import.meta.dir, "../src/index.ts")],
  outdir,
  target: "node",
  format: "esm",
  minify: false,
  external: ["commander", "picocolors", "json-schema-to-zod"],
});

if (!result.success) {
  console.error("Build failed:");
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

// Add shebang to the output
const outFile = join(outdir, "index.js");
const content = await readFile(outFile, "utf-8");

if (!content.startsWith("#!/usr/bin/env node")) {
  await writeFile(outFile, `#!/usr/bin/env node\n${content}`, "utf-8");
}

console.log("Build complete: dist/index.js");
