import { test } from "bun:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  generateSchemasFile,
  generateTypesFile,
} from "../src/utils/schema-codegen";
import { extractSchemas } from "../src/utils/schema-extractor";

const require = createRequire(import.meta.url);
const clientTypes = resolve(import.meta.dir, "../../client/src/types");

async function withProject(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "nile-schema-contracts-"));
  try {
    await mkdir(join(root, "node_modules"));
    await symlink(
      dirname(require.resolve("zod/package.json")),
      join(root, "node_modules/zod"),
      "dir"
    );
    await writeFile(join(root, "package.json"), '{"type":"module"}');
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function generate(root: string, config: string) {
  const entry = join(root, "services.ts");
  await writeFile(entry, config);
  const extraction = await extractSchemas(entry, root);
  await writeFile(join(root, "schemas.ts"), generateSchemasFile(extraction));
  await writeFile(join(root, "types.ts"), generateTypesFile(extraction));
  return extraction;
}

async function typecheck(root: string, consumer: string) {
  await writeFile(join(root, "consumer.ts"), consumer);
  await writeFile(
    join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ESNext",
        module: "Preserve",
        moduleResolution: "Bundler",
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        types: [],
      },
      include: ["consumer.ts", "types.ts", "schemas.ts"],
    })
  );
  execFileSync(
    "node",
    [require.resolve("typescript/bin/tsc"), "-p", join(root, "tsconfig.json")],
    { stdio: "pipe" }
  );
}

test("mixed services generate callable no-schema actions and retain validated input types", async () => {
  await withProject(async (root) => {
    const extraction = await generate(
      root,
      `import { z } from "zod";
export const services = [{ name: "tasks", actions: [
  { name: "list" },
  { name: "create", validation: z.object({ title: z.string(), done: z.boolean().default(false) }) },
] }];`
    );
    assert.equal(extraction.schemas.tasks?.list, null);
    assert.deepEqual(extraction.skipped, []);
    const schemas = await import(pathToFileURL(join(root, "schemas.ts")).href);
    assert.deepEqual(schemas.tasksListSchema.parse({ search: "open" }), {
      search: "open",
    });
    assert.equal(schemas.tasksListSchema.safeParse("invalid").success, false);
    assert.equal(
      schemas.tasksCreateSchema.safeParse({ title: "Ship it" }).success,
      true
    );
    await typecheck(
      root,
      `import type { NileClient } from ${JSON.stringify(clientTypes)};
import type { ServicePayloads } from "./types";
declare const nile: NileClient<ServicePayloads>;
nile.invoke({ service: "tasks", action: "list", payload: {} });
nile.invoke({ service: "tasks", action: "list", payload: { search: "open" } });
nile.invoke({ service: "tasks", action: "create", payload: { title: "Ship it" } });
// @ts-expect-error Payloads remain objects for schema-less actions.
nile.invoke({ service: "tasks", action: "list", payload: "invalid" });
// @ts-expect-error Validated actions still require their declared input.
nile.invoke({ service: "tasks", action: "create", payload: {} });
// @ts-expect-error Unknown actions must not become callable.
nile.invoke({ service: "tasks", action: "missing", payload: {} });`
    );
  });
});

test("a service containing only no-schema actions still generates client contracts", async () => {
  await withProject(async (root) => {
    const extraction = await generate(
      root,
      `export const services = [{ name: "health", actions: [{ name: "check" }] }];`
    );
    assert.deepEqual(extraction.skipped, []);
    const schemas = await import(pathToFileURL(join(root, "schemas.ts")).href);
    assert.deepEqual(schemas.healthCheckSchema.parse({}), {});
    await typecheck(
      root,
      `import type { NileClient } from ${JSON.stringify(clientTypes)};
import type { ServicePayloads } from "./types";
declare const nile: NileClient<ServicePayloads>;
nile.invoke({ service: "health", action: "check", payload: {} });`
    );
  });
});

test("an empty registry replaces old client contracts with an empty action map", async () => {
  await withProject(async (root) => {
    await generate(root, `export const services = [{ name: "tasks", actions: [{ name: "list" }] }];`);
    await generate(root, `export const services = [];`);
    await typecheck(
      root,
      `import type { NileClient } from ${JSON.stringify(clientTypes)};
import type { ServicePayloads } from "./types";
declare const nile: NileClient<ServicePayloads>;
// @ts-expect-error No old action should survive regeneration.
nile.invoke({ service: "tasks", action: "list", payload: {} });`
    );
  });
});
