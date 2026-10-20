import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { checkProjectStructure } from "./check-structure";

it("reports legacy layout and oversized actions without reading symlink targets", async () => {
  const root = await mkdtemp("/tmp/nile-structure-");
  const service = join(root, "src/services/orders");
  await mkdir(service, { recursive: true });
  await writeFile(
    join(root, "src/services/services.config.ts"),
    "export const services = [];\n"
  );
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
