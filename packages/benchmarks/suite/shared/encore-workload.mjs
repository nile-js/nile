import { existsSync, readFileSync } from "node:fs";
import { safeTry } from "../../harness/codecs.mjs";
import { createWorkload, WORKLOAD_NAMES } from "./workload-store.mjs";

export const ENCORE_RUNTIME_CONFIG = "/tmp/nile-benchmark-runtime.json";

/** Read explicit mounted benchmark configuration; an absent mount selects memory only. */
export function readEncoreWorkloadConfig(configPath = ENCORE_RUNTIME_CONFIG) {
  if (!existsSync(configPath))
    return {
      workload: "memory-read",
      runtime: "node",
      sqliteSynchronous: "full",
    };
  const parsed = safeTry(() => JSON.parse(readFileSync(configPath, "utf8")));
  if (!parsed.status)
    throw Error("Invalid Encore benchmark runtime configuration");
  const config = parsed.data;
  if (!config || !WORKLOAD_NAMES.includes(config.workload))
    throw Error("Unsupported Encore benchmark workload");
  if (
    config.workload !== "memory-read" &&
    (typeof config.databasePath !== "string" ||
      typeof config.isolationRoot !== "string")
  )
    throw Error(
      "Encore SQLite requires an explicit databasePath and isolationRoot"
    );
  const sqliteSynchronous = config.sqliteSynchronous ?? "full";
  if (!["full", "normal"].includes(sqliteSynchronous))
    throw Error("Encore sqliteSynchronous must be full or normal");
  return {
    workload: config.workload,
    sqliteSynchronous,
    databasePath: config.databasePath,
    isolationRoot: config.isolationRoot,
    reuseSeeded: config.workload !== "memory-read",
    runtime: "node",
  };
}

/** Every native Encore worker opens the same host-seeded benchmark database. */
export function createEncoreWorkload({
  configPath = ENCORE_RUNTIME_CONFIG,
} = {}) {
  return createWorkload(readEncoreWorkloadConfig(configPath));
}
