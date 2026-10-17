import { parseArgs } from "node:util";

/** Read the standard runtime flag only here; application environment files remain untouched. */
export function readRuntimeEnvironment() {
  return process.env.NODE_ENV;
}

/** Read explicit benchmark arguments; this suite never reads application environment files. */
export function readConfig(
  args = process.argv.slice(2),
  runtimeEnvironment = readRuntimeEnvironment()
) {
  const { values } = parseArgs({
    args,
    options: {
      framework: { type: "string" },
      mode: { type: "string", default: "plain" },
      port: { type: "string", default: "4100" },
      runtime: { type: "string", default: "node" },
    },
  });
  const supported = [
    "nile",
    "nile-release",
    "express",
    "fastify",
    "elysia",
    "trpc",
    "nest-express",
    "nest-fastify",
    "adonis",
    "effect",
  ];
  if (!supported.includes(values.framework))
    throw new Error(`Choose --framework ${supported.join("|")}`);
  if (!["plain", "validated"].includes(values.mode))
    throw new Error("Choose --mode plain|validated");
  if (!["node", "bun"].includes(values.runtime))
    throw new Error("Choose --runtime node|bun");
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("Choose an unprivileged TCP port (1024..65535)");
  return {
    framework: values.framework,
    mode: values.mode,
    runtime: values.runtime,
    nodeEnvironment: runtimeEnvironment,
    port,
  };
}
