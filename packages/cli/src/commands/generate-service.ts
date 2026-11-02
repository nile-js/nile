import { resolve } from "node:path";
import {
  ensureDir,
  pathExists,
  readFileContent,
  writeFileSafe,
} from "../utils/files.js";
import {
  brand,
  createSpinner,
  error,
  hint,
  outro,
  success,
  warn,
} from "../utils/log.js";
import { confirmPrompt } from "../utils/prompt.js";

/**
 * Convert a kebab-case name to camelCase.
 * Example: "user-profiles" -> "userProfiles"
 */
const toCamelCase = (str: string): string =>
  str.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase());

/**
 * Convert a kebab-case name to PascalCase.
 * Example: "user-profiles" -> "UserProfiles"
 */
const toPascalCase = (str: string): string => {
  const camel = toCamelCase(str);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
};

/** Generate the demo action file content */
const generateActionContent = (serviceName: string): string => {
  const camel = toCamelCase(serviceName);
  const pascal = toPascalCase(serviceName);

  return `import { createAction } from "@nilejs/nile";
import { Ok } from "@nilejs/nile/fp";
import z from "zod";

const sample${pascal}Schema = z.object({
  name: z.string().min(1, "Name is required"),
});

type Sample${pascal}Input = z.infer<typeof sample${pascal}Schema>;

const sample${pascal}Handler = async (data: Sample${pascal}Input) => {
  return Ok({ ${camel}: { name: data.name } });
};

export const sample${pascal}Action = createAction({
  name: "sample",
  description: "Sample ${serviceName} action",
  validation: sample${pascal}Schema,
  handler: sample${pascal}Handler,
});
`;
};

/** Register the domain's public actions in its own entry point. */
const generateBarrelContent = (serviceName: string): string => {
  const pascal = toPascalCase(serviceName);
  const camel = toCamelCase(serviceName);
  return `import { createService } from "@nilejs/nile";
import { sample${pascal}Action } from "./actions/sample";

export const ${camel}Service = createService({
  name: "${serviceName}",
  description: "${pascal} service",
  actions: [sample${pascal}Action],
});
`;
};

/** Generate the import + registration snippet for services.config.ts */
const generateConfigSnippet = (serviceName: string): string => {
  const camel = toCamelCase(serviceName);
  const importLine = `import { ${camel}Service } from "./${serviceName}";`;
  const serviceEntry = `  ${camel}Service,`;

  return `${importLine}\n\n// Add to services array:\n${serviceEntry}`;
};

/**
 * Try to auto-register the service in services.config.ts.
 * Returns true on success, false if it couldn't be done.
 */
const autoRegisterService = async (
  configPath: string,
  serviceName: string
): Promise<boolean> => {
  try {
    let content = await readFileContent(configPath);
    const camel = toCamelCase(serviceName);

    const importLine = `import { ${camel}Service } from "./${serviceName}";`;

    // Find the last import line and add after it
    const importLines = content
      .split("\n")
      .filter((line) => line.startsWith("import "));
    if (importLines.length === 0) {
      return false;
    }

    const lastImport = importLines.at(-1);
    if (!lastImport) {
      return false;
    }

    content = content.replace(lastImport, `${lastImport}\n${importLine}`);

    // Find the services array closing bracket and add before it
    const serviceEntry = `  ${camel}Service,`;

    // Insert before the array's closing bracket: `]);` for createServices([...]), `];` for a plain array.
    const wrappedClosingIndex = content.lastIndexOf("]);");
    const plainClosingIndex = content.lastIndexOf("];");
    const closingIndex = Math.max(wrappedClosingIndex, plainClosingIndex);
    if (closingIndex === -1) {
      return false;
    }

    const prefix = content.slice(0, closingIndex).trimEnd();
    const separator = prefix.endsWith("[") || prefix.endsWith(",") ? "" : ",";
    content = `${prefix}${separator}\n${serviceEntry}\n${content.slice(closingIndex)}`;

    await writeFileSafe(configPath, content);
    return true;
  } catch {
    return false;
  }
};

/**
 * Generate a new service directory with a demo action.
 */
export const generateServiceCommand = async (
  serviceName: string
): Promise<void> => {
  const servicesDir = resolve(process.cwd(), "src/services");

  if (!pathExists(servicesDir)) {
    error("Could not find src/services/ directory.");
    hint("Make sure you're in a Nile project root.");
    process.exit(1);
  }

  const serviceDir = resolve(servicesDir, serviceName);

  if (pathExists(serviceDir)) {
    error(
      `Service "${serviceName}" already exists at src/services/${serviceName}/`
    );
    process.exit(1);
  }

  brand();

  const spinner = createSpinner(`Creating service ${serviceName}...`);

  await ensureDir(serviceDir);

  await writeFileSafe(
    resolve(serviceDir, "actions/sample.ts"),
    generateActionContent(serviceName)
  );

  await writeFileSafe(
    resolve(serviceDir, "index.ts"),
    generateBarrelContent(serviceName)
  );

  spinner.stop(`Service created at src/services/${serviceName}/`);

  // Try to register in services.config.ts
  const configPath = resolve(servicesDir, "services.config.ts");

  if (!pathExists(configPath)) {
    warn("Could not find services.config.ts");
    console.log("");
    hint("Add this to your services config:");
    console.log(generateConfigSnippet(serviceName));
    outro();
    return;
  }

  const shouldRegister = await confirmPrompt(
    "Register this service in services.config.ts?"
  );

  if (shouldRegister) {
    const registered = await autoRegisterService(configPath, serviceName);
    if (registered) {
      success("Registered in services.config.ts");
    } else {
      warn("Could not auto-register. Add manually:");
      console.log(`\n${generateConfigSnippet(serviceName)}\n`);
    }
  } else {
    console.log("");
    hint("Add this to your services config:");
    console.log(generateConfigSnippet(serviceName));
  }

  outro();
};
