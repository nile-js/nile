import { lstat, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Ok, safeTry } from "slang-ts";
import { inspectServiceActions } from "./inspect-actions";
import type { ProjectOptions, StructureIssue, StructureReport } from "./types";

/** Inspect only recognized source directories; never recurse into symlinks or unrelated project data. */
export async function checkProjectStructure(
  options: ProjectOptions = {}
): Promise<Ok<StructureReport>> {
  const root = resolve(options.root ?? process.cwd());
  const source = join(root, "src");
  const sourceInfo = await safeTry(() => lstat(source));
  // Bundles need not deploy their source tree. An explicit root requests a real source inspection.
  if (sourceInfo.isErr) {
    return Ok<StructureReport>({
      skipped: !options.root,
      issues: options.root
        ? [
            {
              path: source,
              message: "Expected src directory at the configured project root",
            },
          ]
        : [],
    });
  }
  if (!sourceInfo.value.isDirectory() || sourceInfo.value.isSymbolicLink()) {
    return Ok<StructureReport>({
      skipped: false,
      issues: [
        {
          path: source,
          message: "Expected src to be a real directory, not a file or symlink",
        },
      ],
    });
  }
  const issues: StructureIssue[] = [];
  const entryPoints = await Promise.all(
    ["index.ts", "server.ts"].map((name) =>
      safeTry(() => lstat(join(source, name)))
    )
  );
  if (
    !entryPoints.some(
      (entry) =>
        entry.isOk && entry.value.isFile() && !entry.value.isSymbolicLink()
    )
  ) {
    issues.push({
      path: source,
      message:
        "Expected src/index.ts or src/server.ts as the application entry point",
    });
  }
  const serviceInfo = await safeTry(() => lstat(join(source, "services")));
  if (serviceInfo.isOk && serviceInfo.value.isSymbolicLink()) {
    issues.push({
      path: join(source, "services"),
      message: "Expected a real services directory, not a symlink",
    });
    return Ok<StructureReport>({ skipped: false, issues });
  }

  const services = join(source, "services");
  const listed = await safeTry(() =>
    readdir(services, { withFileTypes: true })
  );
  if (listed.isErr) {
    return Ok<StructureReport>({
      skipped: false,
      issues: [
        {
          path: services,
          message:
            "Create src/services and its explicit services.config.ts registry",
        },
      ],
    });
  }
  if (
    !listed.value.some(
      (entry) => entry.isFile() && entry.name === "services.config.ts"
    )
  ) {
    issues.push({
      path: services,
      message: "Expected an explicit services.config.ts registry",
    });
  }
  for (const service of listed.value.filter(
    (entry) =>
      entry.isDirectory() && !entry.isSymbolicLink() && entry.name !== "modules"
  )) {
    await inspectServiceActions(join(services, service.name), issues);
  }
  return Ok<StructureReport>({ skipped: false, issues });
}

/** Apply the report once at boot, outside request execution. */
export async function enforceProjectStructure(
  options: ProjectOptions = {}
): Promise<void> {
  if (options.structure === false) {
    return;
  }
  const report = await checkProjectStructure(options);
  if (report.isErr) {
    throw new Error("Project structure inspection failed");
  }
  if (!report.value.issues.length) {
    return;
  }
  const message = report.value.issues
    .map((issue) => `${issue.path}: ${issue.message}`)
    .join("\n");
  if (options.structure !== "warn") {
    throw new Error(message);
  }
  console.warn(`[Nile project structure]\n${message}`);
}
