import { parseArgs } from "node:util";
import { readRuntimeEnvironment } from "./config.mjs";

export const NODE_FRAMEWORKS = [
  "nile",
  "elysia",
  "express",
  "fastify",
  "trpc",
  "nest-express",
  "nest-fastify",
  "adonis",
  "effect",
];
export const BUN_FRAMEWORKS = ["nile", "elysia", "effect"];

/** Require the owner-provided production runtime flag before starting fixture children. */
export function readMatrixConfig(
  args = process.argv.slice(2),
  runtimeEnvironment = readRuntimeEnvironment()
) {
  if (runtimeEnvironment !== "production")
    throw Error("Set NODE_ENV=production when running the benchmark matrix");
  const { values } = parseArgs({
    args,
    options: {
      framework: { type: "string" },
      runtime: { type: "string", default: "node" },
      profile: { type: "string", default: "development" },
      duration: { type: "string" },
      warmup: { type: "string" },
      "output-root": { type: "string" },
      "nile-revision": { type: "string", default: "working-tree" },
    },
  });
  if (!["node", "bun"].includes(values.runtime))
    throw Error("runtime must be node or bun");
  if (!["development", "publication"].includes(values.profile))
    throw Error("profile must be development or publication");
  const supported = values.runtime === "bun" ? BUN_FRAMEWORKS : NODE_FRAMEWORKS;
  const frameworks = values.framework
    ? values.framework.split(",")
    : [...supported];
  if (
    !frameworks.length ||
    new Set(frameworks).size !== frameworks.length ||
    frameworks.some((name) => !supported.includes(name))
  )
    throw Error(
      `Choose framework IDs from ${supported.join(",")}; Encore requires a separate owner-managed CLI setup`
    );
  const publication = values.profile === "publication";
  const durationSeconds = Number(values.duration ?? (publication ? 30 : 2));
  const warmupSeconds = Number(values.warmup ?? (publication ? 5 : 1));
  if (
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0 ||
    !Number.isFinite(warmupSeconds) ||
    warmupSeconds <= 0
  )
    throw Error("duration and warmup must be positive seconds");
  if (publication && (durationSeconds < 30 || warmupSeconds < 5))
    throw Error("publication requires duration >=30 and warmup >=5 seconds");
  return {
    runtime: values.runtime,
    nodeEnvironment: runtimeEnvironment,
    profile: values.profile,
    frameworks,
    durationSeconds,
    warmupSeconds,
    concurrencies: publication ? [1, 30, 100, 300] : [100],
    rounds: 5,
    seed: 421017,
    outputRoot: values["output-root"],
    nileRevision: values["nile-revision"],
  };
}

/** Pin framework labels to suite declarations and actual server readiness information. */
export function createMatrixManifest({
  config,
  mode,
  readyServers,
  dependencies,
  currentNileVersion,
  artifactSha256,
}) {
  const packages = {
    nile: "@nilejs/nile",
    elysia: "elysia",
    express: "express",
    fastify: "fastify",
    trpc: "@trpc/server",
    "nest-express": "@nestjs/core",
    "nest-fastify": "@nestjs/core",
    adonis: "@adonisjs/core",
    effect: "effect",
  };
  const frameworks = readyServers.map((ready) => {
    if (
      !config.frameworks.includes(ready.framework) ||
      ready.mode !== mode ||
      ready.runtime !== config.runtime ||
      config.nodeEnvironment !== "production" ||
      ready.nodeEnvironment !== "production" ||
      !Number.isInteger(ready.port) ||
      ready.port < 1024 ||
      ready.port > 65535
    )
      throw Error("Readiness does not match requested fixture configuration");
    const codec = ready.framework === "nile"
      ? "nile"
      : ready.framework === "trpc"
        ? "trpc"
        : "json";
    const version =
      ready.framework === "nile"
        ? `${currentNileVersion} source:${config.nileRevision} sha256:${artifactSha256}`
        : dependencies[packages[ready.framework]];
    if (!version || !ready.runtimeVersion)
      throw Error("Missing exact fixture or runtime version");
    return {
      name: ready.framework,
      url: `http://127.0.0.1:${ready.port}`,
      codec,
      pathTemplate:
        codec === "nile"
          ? "/api/services"
          : codec === "trpc"
            ? "/trpc/action-{action}"
            : "/actions/action-{action}",
      runtime: `${ready.runtime} ${ready.runtimeVersion}`,
      nodeEnvironment: ready.nodeEnvironment,
      version,
    };
  });
  if (
    frameworks.length !== config.frameworks.length ||
    new Set(frameworks.map(({ name }) => name)).size !== frameworks.length
  )
    throw Error(
      "Readiness must include every requested framework exactly once"
    );
  return {
    profile: config.profile,
    nodeEnvironment: config.nodeEnvironment,
    durationSeconds: config.durationSeconds,
    warmupSeconds: config.warmupSeconds,
    timeoutSeconds: 5,
    rounds: 5,
    seed: config.seed,
    workload: {
      name: `300-actions-json-increment-${mode}`,
      mode,
      actionCount: 300,
      concurrencies: config.concurrencies,
    },
    frameworks,
    pinnedSuiteDependencies: dependencies,
    exclusions: [
      {
        name: "encore",
        reason:
          "Encore CLI/runtime unavailable; do not substitute a plain Node server for its native application runtime. Run its separate fixture manually when available.",
      },
    ],
  };
}
