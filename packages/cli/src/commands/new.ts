import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  copyDir,
  getFilesRecursive,
  pathExists,
  replaceInFile,
} from "../utils/files.js";
import {
  brand,
  createSpinner,
  error,
  hint,
  outro,
  success,
} from "../utils/log.js";

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

  brand();

  const spinner = createSpinner(`Creating ${projectName}...`);

  const templateDir = resolveTemplateDir();
  await copyDir(templateDir, targetDir);

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

  spinner.stop("Project ready.");

  success(`Created ${projectName}`);

  console.log("");
  hint(`cd ${projectName}`);
  hint("bun install");
  hint("cp .env.example .env");
  hint("bun run dev");

  console.log("");
  success("Generate with the CLI:");
  hint("nile g service <name>          Add a new service");
  hint("nile g action <service> <name> Add an action to a service");
  hint("nile g schema                  Generate Zod schemas & types");

  outro();
};
