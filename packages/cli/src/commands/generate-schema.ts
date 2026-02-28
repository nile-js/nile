import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { ensureDir, pathExists, writeFileSafe } from "../utils/files.js";
import {
  brand,
  createSpinner,
  error,
  hint,
  outro,
  success,
  warn,
} from "../utils/log.js";
import { inputPrompt } from "../utils/prompt.js";
import {
  generateSchemasFile,
  generateTypesFile,
} from "../utils/schema-codegen.js";
import {
  type ExtractionResult,
  extractSchemas,
  findServicesConfig,
} from "../utils/schema-extractor.js";

const DEFAULT_OUTPUT_DIR = "src/generated";
const LEADING_SLASH = /^\//;

/**
 * Resolve the services config path.
 * Auto-detects the default location, falls back to prompting the user.
 */
const resolveConfigPath = async (
  projectRoot: string,
  entryFlag?: string
): Promise<string | null> => {
  // If user provided --entry, use it directly
  if (entryFlag) {
    const absolute = resolve(projectRoot, entryFlag);
    if (!pathExists(absolute)) {
      error(`Config file not found: ${entryFlag}`);
      return null;
    }
    return absolute;
  }

  // Try auto-detection
  const detected = findServicesConfig(projectRoot);
  if (detected) {
    success("Found services config at src/services/services.config.ts");
    return detected;
  }

  // Prompt user for the path
  warn("Could not find src/services/services.config.ts");
  const userPath = await inputPrompt(
    "Enter the path to your services config file:"
  );

  if (!userPath) {
    error("No config path provided.");
    return null;
  }

  const absolute = resolve(projectRoot, userPath);
  if (!pathExists(absolute)) {
    error(`Config file not found: ${userPath}`);
    return null;
  }

  return absolute;
};

/**
 * Check if bun is available in the system PATH.
 */
const checkBunAvailable = (): boolean => {
  try {
    execFileSync("bun", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

/**
 * Generate Zod schema and TypeScript type files from action validation schemas.
 * This is the handler for `nile generate schema`.
 */
export const generateSchemaCommand = async (options: {
  entry?: string;
  output?: string;
}): Promise<void> => {
  const projectRoot = process.cwd();

  brand();

  // Verify bun is available (needed for subprocess)
  if (!checkBunAvailable()) {
    error("Bun is required for schema extraction but was not found.");
    hint("Install bun: https://bun.sh");
    process.exit(1);
  }

  // Resolve config path
  const configPath = await resolveConfigPath(projectRoot, options.entry);
  if (!configPath) {
    process.exit(1);
  }

  // Extract schemas via bun subprocess
  const spinner = createSpinner("Extracting action schemas...");

  let extraction: ExtractionResult;
  try {
    extraction = await extractSchemas(configPath, projectRoot);
  } catch (err) {
    spinner.stop("Extraction failed");
    console.log("");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const schemaCount = Object.values(extraction.schemas).reduce(
    (sum, actions) => sum + Object.keys(actions).length,
    0
  );

  if (schemaCount === 0) {
    spinner.stop("No action schemas found");
    warn("None of the actions have validation schemas defined.");
    hint("Add a Zod validation schema to your actions to generate types.");
    outro();
    return;
  }

  spinner.stop(
    `Extracted ${schemaCount} action schema${schemaCount > 1 ? "s" : ""}`
  );

  // Generate output files
  const outputDir = resolve(projectRoot, options.output ?? DEFAULT_OUTPUT_DIR);
  await ensureDir(outputDir);

  const schemasContent = generateSchemasFile(extraction);
  const typesContent = generateTypesFile(extraction);

  const schemasPath = resolve(outputDir, "schemas.ts");
  const typesPath = resolve(outputDir, "types.ts");

  await writeFileSafe(schemasPath, schemasContent);
  success(
    `Generated ${schemasPath.replace(projectRoot, "").replace(LEADING_SLASH, "")}`
  );

  await writeFileSafe(typesPath, typesContent);
  success(
    `Generated ${typesPath.replace(projectRoot, "").replace(LEADING_SLASH, "")}`
  );

  if (extraction.skipped.length > 0) {
    console.log("");
    hint(`Skipped ${extraction.skipped.length} action(s) without validation:`);
    hint(extraction.skipped.join(", "));
  }

  outro();
};
