import { execFile } from "node:child_process";
import { unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathExists } from "./files.js";

/** Shape of the extraction output from the bun subprocess */
export interface ExtractionResult {
  schemas: Record<string, Record<string, unknown>>;
  skipped: string[];
}

const TEMP_SCRIPT_NAME = ".nile-schema-extract.ts";
const LEADING_SLASH = /^\//;
const TS_EXTENSION = /\.ts$/;

/**
 * Build the temporary TypeScript extraction script content.
 * This script imports the user's services config, walks all services and actions,
 * calls z.toJSONSchema() on each action's validation schema, and prints JSON to stdout.
 */
const buildExtractionScript = (configPath: string): string => {
  return `import z from "zod";
import { services } from "${configPath}";

const schemas: Record<string, Record<string, unknown>> = {};
const skipped: string[] = [];

for (const service of services) {
  const serviceSchemas: Record<string, unknown> = {};

  for (const action of service.actions) {
    if (!action.validation) {
      skipped.push(\`\${service.name}.\${action.name}\`);
      continue;
    }

    try {
      const jsonSchema = z.toJSONSchema(action.validation, { unrepresentable: "any" });
      serviceSchemas[action.name] = jsonSchema;
    } catch {
      skipped.push(\`\${service.name}.\${action.name}\`);
    }
  }

  if (Object.keys(serviceSchemas).length > 0) {
    schemas[service.name] = serviceSchemas;
  }
}

console.log(JSON.stringify({ schemas, skipped }));
`;
};

/**
 * Resolve the import path for the extraction script.
 * Converts the absolute config path to a relative import suitable for the temp script
 * that runs from the project root.
 */
const resolveImportPath = (configPath: string, projectRoot: string): string => {
  const relative = configPath
    .replace(projectRoot, "")
    .replace(LEADING_SLASH, "./")
    .replace(TS_EXTENSION, "");
  return relative.startsWith("./") ? relative : `./${relative}`;
};

/**
 * Run the extraction subprocess with bun.
 * Writes a temp script, executes it with bun, captures stdout JSON, and cleans up.
 */
export const extractSchemas = (
  configPath: string,
  projectRoot: string
): Promise<ExtractionResult> => {
  const importPath = resolveImportPath(configPath, projectRoot);
  const scriptContent = buildExtractionScript(importPath);
  const tempScriptPath = resolve(projectRoot, TEMP_SCRIPT_NAME);

  return new Promise((resolve, reject) => {
    writeFile(tempScriptPath, scriptContent, "utf-8")
      .then(() => {
        execFile(
          "bun",
          ["run", TEMP_SCRIPT_NAME],
          { cwd: projectRoot, timeout: 30_000 },
          (err, stdout, stderr) => {
            // Always clean up temp file
            unlink(tempScriptPath).catch(() => {
              /* cleanup failure is non-critical */
            });

            if (err) {
              const message = stderr?.trim() || err.message;
              reject(new Error(`Schema extraction failed:\n${message}`));
              return;
            }

            try {
              const result = JSON.parse(stdout.trim()) as ExtractionResult;
              resolve(result);
            } catch {
              reject(
                new Error(
                  `Failed to parse extraction output. Raw output:\n${stdout.trim()}`
                )
              );
            }
          }
        );
      })
      .catch((writeErr) => {
        reject(
          new Error(
            `Failed to write temp extraction script: ${writeErr.message}`
          )
        );
      });
  });
};

/** Default path for the services config relative to project root */
const DEFAULT_CONFIG_PATH = "src/services/services.config.ts";

/**
 * Find the services config file.
 * Returns the absolute path if found at the default location, null otherwise.
 */
export const findServicesConfig = (projectRoot: string): string | null => {
  const defaultPath = resolve(projectRoot, DEFAULT_CONFIG_PATH);
  return pathExists(defaultPath) ? defaultPath : null;
};
