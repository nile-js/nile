import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { createNileServer } from "../nile/server";
import { checkProjectStructure } from "./check-structure";

it("reports legacy layout and oversized actions without reading symlink targets", async () => {
  const root = await mkdtemp("/tmp/nile-structure-");
  const service = join(root, "src/services/orders");
  await mkdir(service, { recursive: true });
  await writeFile(
    join(root, "src/services/services.config.ts"),
    "export const services = [];\n"
  );
  await writeFile(join(root, "src/server.ts"), "export {};\n");
  await writeFile(join(service, "index.ts"), "export {};\n");
  const legacy = await checkProjectStructure({ root });
  expect(legacy.isOk && legacy.value.issues[0]?.message).toContain("actions/");
  const actions = join(service, "actions");
  await mkdir(actions);
  await writeFile(join(actions, "large.ts"), "// line\n".repeat(401));
  await symlink(join(root, "does-not-exist"), join(actions, "linked.ts"));
  const report = await checkProjectStructure({ root });
  expect(report.isOk && report.value.issues).toEqual([
    {
      path: join(actions, "large.ts"),
      message: expect.stringContaining("400 lines"),
    },
  ]);
});

it("checks domain entry points and action-folder barrels while allowing optional modules", async () => {
  const root = await mkdtemp("/tmp/nile-domain-layout-");
  const domain = join(root, "src/services/projects");
  const action = join(domain, "actions/archive-project");
  await mkdir(join(action, "modules"), { recursive: true });
  await mkdir(join(domain, "modules"));
  await mkdir(join(root, "src/services/modules"));
  await writeFile(join(root, "src/index.ts"), "export {};\n");
  await writeFile(
    join(root, "src/services/services.config.ts"),
    "export {};\n"
  );
  await writeFile(join(action, "archive-project.ts"), "export {};\n");
  expect((await checkProjectStructure({ root })).value.issues).toEqual([
    { path: domain, message: expect.stringContaining("register the service") },
    {
      path: action,
      message: expect.stringContaining("export the folder-based action"),
    },
  ]);
  await writeFile(join(domain, "index.ts"), "export {};\n");
  await writeFile(join(action, "index.ts"), "export {};\n");
  expect((await checkProjectStructure({ root })).value.issues).toEqual([]);
});

it("applies layout checks at boot with warn, error and disabled policies", async () => {
  const root = await mkdtemp("/tmp/nile-boot-layout-");
  await mkdir(join(root, "src/services/projects/actions"), { recursive: true });
  await writeFile(
    join(root, "src/services/services.config.ts"),
    "export {};\n"
  );
  const config = {
    serverName: "Structure boot check",
    services: [{ name: "projects", description: "Projects", actions: [] }],
    runtime: "node" as const,
    forceNewInstance: true,
    logServices: false,
  };
  await expect(
    createNileServer({ ...config, project: { root, structure: "error" } })
  ).rejects.toThrow("application entry point");
  await expect(
    createNileServer({ ...config, project: { root } })
  ).rejects.toThrow("application entry point");
  const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  try {
    const app = await createNileServer({
      ...config,
      project: { root, structure: "warn" },
    });
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining("register the service")
    );
    await app.lifecycle.shutdown();
    warning.mockClear();
    const unchecked = await createNileServer({
      ...config,
      project: { root, structure: false },
    });
    expect(warning).not.toHaveBeenCalled();
    await unchecked.lifecycle.shutdown();
  } finally {
    warning.mockRestore();
  }
});
