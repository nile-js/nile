import type { Dirent } from "node:fs";
import { lstat, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { safeTry } from "slang-ts";
import type { StructureIssue } from "./types";

/** Read only recognized action entry points, excluding private modules and symlinks. */
async function inspectAction(path: string, issues: StructureIssue[]) {
  const read = await safeTry(() => readFile(path, "utf8"));
  if (read.isErr) {
    issues.push({ path, message: "Action file could not be read" });
    return;
  }
  if (read.value.split("\n").length > 400) {
    issues.push({
      path,
      message:
        "Action exceeds 400 lines; move private logic into its action folder's modules directory",
    });
  }
}

/** Validate an action folder without recursively inspecting its modules or business data. */
async function inspectFolder(
  folder: string,
  name: string,
  issues: StructureIssue[]
) {
  const entryPoint = join(folder, `${name}.ts`);
  const exists = await safeTry(() => lstat(entryPoint));
  if (exists.isErr || !exists.value.isFile() || exists.value.isSymbolicLink()) {
    issues.push({
      path: folder,
      message: `Expected ${name}.ts as the action entry point; keep private helpers in modules/`,
    });
    return;
  }
  await inspectAction(entryPoint, issues);
}

/** Check a service's action organization and entry-point size. */
export async function inspectServiceActions(
  directory: string,
  issues: StructureIssue[]
) {
  const children = await safeTry(() =>
    readdir(directory, { withFileTypes: true })
  );
  if (children.isErr) {
    issues.push({
      path: directory,
      message: "Service directory could not be read",
    });
    return;
  }
  const actions = children.value.find(
    (entry: Dirent) => entry.name === "actions"
  );
  if (!actions?.isDirectory() || actions.isSymbolicLink()) {
    issues.push({
      path: directory,
      message:
        "Group action entry points under actions/; existing registrations remain supported",
    });
    return;
  }
  const actionPath = join(directory, "actions");
  const entries = await safeTry(() =>
    readdir(actionPath, { withFileTypes: true })
  );
  if (entries.isErr) {
    issues.push({
      path: actionPath,
      message: "Actions directory could not be read",
    });
    return;
  }
  for (const entry of entries.value) {
    if (
      entry.isFile() &&
      entry.name.endsWith(".ts") &&
      !entry.name.endsWith(".test.ts")
    ) {
      await inspectAction(join(actionPath, entry.name), issues);
    }
    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      await inspectFolder(join(actionPath, entry.name), entry.name, issues);
    }
  }
}
