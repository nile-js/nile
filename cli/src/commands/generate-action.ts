import { resolve } from "node:path";
import { pathExists, writeFileSafe } from "../utils/files.js";
import { error, header, hint, success } from "../utils/log.js";

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

  return `import { type Action, createAction } from "@nilejs/nile";
import { Ok } from "slang-ts";
import z from "zod";

const ${camel}Schema = z.object({
  // Define your validation schema here
});

const ${camel}Handler = async (data: Record<string, unknown>) => {
  // Implement your ${serviceName}.${actionName} logic here
  return Ok({ result: data });
};

export const ${camel}Action: Action = createAction({
  name: "${actionName}",
  description: "${pascal} action for ${serviceName}",
  handler: ${camel}Handler,
  validation: ${camel}Schema,
});
`;
};

/**
 * Generate a new action file in an existing service directory.
 */
export const generateActionCommand = async (
  serviceName: string,
  actionName: string
): Promise<void> => {
  const serviceDir = resolve(process.cwd(), "src/services", serviceName);

  if (!pathExists(serviceDir)) {
    error(`Service "${serviceName}" not found at src/services/${serviceName}/`);
    hint(`Create the service first: nile generate service ${serviceName}`);
    process.exit(1);
  }

  const actionFile = resolve(serviceDir, `${actionName}.ts`);

  if (pathExists(actionFile)) {
    error(
      `Action file "${actionName}.ts" already exists in src/services/${serviceName}/`
    );
    process.exit(1);
  }

  header(`Generating action: ${serviceName}/${actionName}`);

  await writeFileSafe(
    actionFile,
    generateActionContent(actionName, serviceName)
  );

  success(`Action created at src/services/${serviceName}/${actionName}.ts`);

  const camel = toCamelCase(actionName);
  header("Next steps:");
  hint("Import and register the action in your service config:");
  hint(`  import { ${camel}Action } from "./${serviceName}/${actionName}";`);
};
