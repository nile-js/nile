import { resolve } from "node:path";
import { pathExists, writeFileSafe } from "../utils/files.js";
import { brand, createSpinner, error, hint, outro } from "../utils/log.js";

/**
 * Convert a kebab-case name to camelCase.
 * Example: "get-user" -> "getUser"
 */
const toCamelCase = (str: string): string =>
  str.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase());

/**
 * Convert a kebab-case name to PascalCase.
 * Example: "get-user" -> "GetUser"
 */
const toPascalCase = (str: string): string => {
  const camel = toCamelCase(str);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
};

/** Generate action file content */
const generateActionContent = (
  actionName: string,
  serviceName: string
): string => {
  const camel = toCamelCase(actionName);
  const pascal = toPascalCase(actionName);

  return `import { createAction } from "@nilejs/nile";
import { Ok } from "slang-ts";
import z from "zod";

const ${camel}Schema = z.object({
  // Describe the input this action accepts
});

type ${pascal}Input = z.infer<typeof ${camel}Schema>;

const ${camel}Handler = async (input: ${pascal}Input) => {
  // Implement ${serviceName}.${actionName} here
  return Ok({ result: input });
};

export const ${camel}Action = createAction<${pascal}Input>({
  name: "${actionName}",
  description: "${pascal} action for ${serviceName}",
  validation: ${camel}Schema,
  handler: ${camel}Handler,
});
`;
};

/**
 * Generate a new action file in an existing service directory.
 */
export const generateActionCommand = async (
  serviceName: string,
  actionName: string,
  options: { folder?: boolean } = {}
): Promise<void> => {
  const serviceDir = resolve(process.cwd(), "src/services", serviceName);

  if (!pathExists(serviceDir)) {
    error(`Service "${serviceName}" not found at src/services/${serviceName}/`);
    hint(`Create the service first: nile generate service ${serviceName}`);
    process.exit(1);
  }

  const relative = options.folder
    ? `actions/${actionName}/${actionName}.ts`
    : `actions/${actionName}.ts`;
  const actionFile = resolve(serviceDir, relative);

  const existingEntries = [
    actionFile,
    resolve(serviceDir, `${actionName}.ts`),
    resolve(serviceDir, `actions/${actionName}.ts`),
    resolve(serviceDir, `actions/${actionName}/${actionName}.ts`),
  ];
  if (existingEntries.some(pathExists)) {
    error(
      `Action file "${actionName}.ts" already exists in src/services/${serviceName}/`
    );
    process.exit(1);
  }

  brand();

  const spinner = createSpinner(`Creating action ${actionName}...`);

  await writeFileSafe(
    actionFile,
    generateActionContent(actionName, serviceName)
  );

  if (options.folder) {
    await writeFileSafe(
      resolve(serviceDir, `actions/${actionName}/index.ts`),
      `export { ${toCamelCase(actionName)}Action } from "./${actionName}";\n`
    );
  }

  spinner.stop(`Action created at src/services/${serviceName}/${relative}`);

  const camel = toCamelCase(actionName);
  console.log("");
  hint("Register the action in your service config:");
  hint(
    `  import { ${camel}Action } from "./${serviceName}/actions/${actionName}";`
  );

  outro();
};
