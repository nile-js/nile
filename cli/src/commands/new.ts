import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  copyDir,
  getFilesRecursive,
  pathExists,
  replaceInFile,
} from "../utils/files.js";
import { error, header, hint, info, success } from "../utils/log.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

/**
 * Resolve the template directory.
 * In development: ../template (relative to src/commands/)
 * When published: ../../template (relative to dist/)
 */
const resolveTemplateDir = (): string => {
  const devPath = resolve(__dirname, "../../template");
  if (pathExists(devPath)) {
    return devPath;
  }

  const distPath = resolve(__dirname, "../template");
  if (pathExists(distPath)) {
    return distPath;
  }

  throw new Error(
    "Template directory not found. The CLI package may be corrupted."
  );
};

/**
 * Scaffold a new Nile project by copying the template and replacing placeholders.
 */
export const newCommand = async (projectName: string): Promise<void> => {
  const targetDir = resolve(process.cwd(), projectName);

  if (pathExists(targetDir)) {
    error(`Directory "${projectName}" already exists.`);
    process.exit(1);
  }

  header(`Creating project: ${projectName}`);

  const templateDir = resolveTemplateDir();

  info("Copying project files...");
  await copyDir(templateDir, targetDir);

  info("Configuring project...");
  const allFiles = await getFilesRecursive(targetDir);
  const replacements = { "{{projectName}}": projectName };

  for (const filePath of allFiles) {
    if (
      filePath.endsWith(".ts") ||
      filePath.endsWith(".json") ||
      filePath.endsWith(".md")
    ) {
      await replaceInFile(filePath, replacements);
    }
  }

  success(`Project "${projectName}" created.`);

  header("Next steps:");
  hint(`cd ${projectName}`);
  hint("bun install");
  hint("cp .env.example .env");
  hint("bun run dev");
};
