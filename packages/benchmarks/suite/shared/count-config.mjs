import { parseArgs } from "node:util";
import { NODE_FRAMEWORKS, BUN_FRAMEWORKS } from "./matrix-config.mjs";
import { readRuntimeEnvironment } from "./config.mjs";

export const OPERATIONS = ["memory-read", "sqlite-read", "sqlite-read-write"];

/** Divide the measured budget exactly; setup, preflight and warmup never consume it. */
export function allocateRequestBudget({ total, cells = 6, repeats = 3 }) {
  if (!Number.isSafeInteger(total) || total < cells * repeats * 300)
    throw Error("Request budget must cover every action in every repeat");
  const trials = cells * repeats;
  const base = Math.floor(total / trials);
  const remainder = total % trials;
  return Array.from({ length: cells }, (_, cell) =>
    Array.from(
      { length: repeats },
      (_, round) => base + (cell * repeats + round < remainder ? 1 : 0)
    )
  );
}

/** Keep the requested count protocol separate from preserved duration-run settings. */
export function readCountConfig(
  args = process.argv.slice(2),
  environment = readRuntimeEnvironment()
) {
  if (environment !== "production") throw Error("Set NODE_ENV=production");
  const { values } = parseArgs({
    args,
    options: {
      runtime: { type: "string", default: "node" },
      framework: { type: "string" },
      requests: { type: "string", default: "1000000" },
      concurrency: { type: "string", default: "100" },
      warmup: { type: "string", default: "5" },
      "output-root": { type: "string" },
      resume: { type: "string" },
      "nile-revision": { type: "string", default: "9f5a173" },
      "server-cpu": { type: "string", default: "1" },
      "client-cpu": { type: "string", default: "0" },
      "client-runtime": { type: "string", default: "bun" },
      "quiet-idle": { type: "string", default: "75" },
      "sqlite-synchronous": { type: "string", default: "normal" },
    },
  });
  if (!["node", "bun"].includes(values.runtime))
    throw Error("runtime must be node or bun");
  if (!["node", "bun"].includes(values["client-runtime"]))
    throw Error("client-runtime must be node or bun");
  const defaults =
    values.runtime === "node" ? [...NODE_FRAMEWORKS, "encore"] : BUN_FRAMEWORKS;
  const supported = [
    ...defaults,
    "hono",
    ...(values.runtime === "bun" ? ["bun"] : []),
  ];
  const frameworks = values.framework?.split(",") ?? [...defaults];
  if (
    !frameworks.length ||
    new Set(frameworks).size !== frameworks.length ||
    frameworks.some((name) => !supported.includes(name))
  )
    throw Error(`Choose current fixtures: ${supported.join(",")}`);
  const requestBudget = Number(values.requests);
  if (!["normal", "full"].includes(values["sqlite-synchronous"]))
    throw Error("sqlite-synchronous must be normal or full");
  const requestCounts = allocateRequestBudget({ total: requestBudget });
  const concurrency = Number(values.concurrency);
  const warmupSeconds = Number(values.warmup);
  const quietIdlePercent = Number(values["quiet-idle"]);
  const serverCpu = Number(values["server-cpu"]);
  const clientCpu = Number(values["client-cpu"]);
  if (![1, 30, 100, 300].includes(concurrency))
    throw Error("concurrency must be 1,30,100,300");
  if (values["client-runtime"] === "bun" && concurrency > 256)
    throw Error(
      "Bun native fetch supports at most 256 concurrent requests here; use --client-runtime node for the 300-concurrency diagnostic"
    );
  if (!Number.isFinite(warmupSeconds) || warmupSeconds < 5)
    throw Error("warmup must be at least five seconds");
  if (
    !Number.isFinite(quietIdlePercent) ||
    quietIdlePercent < 0 ||
    quietIdlePercent > 100
  )
    throw Error("quiet-idle must be 0..100");
  if (
    ![serverCpu, clientCpu].every(
      (cpu) => Number.isSafeInteger(cpu) && cpu >= 0
    ) ||
    serverCpu === clientCpu
  )
    throw Error("Choose distinct nonnegative server/client CPU IDs");
  return {
    runtime: values.runtime,
    clientRuntime: values["client-runtime"],
    sqliteSynchronous: values["sqlite-synchronous"],
    frameworks,
    requestBudget,
    requestCounts,
    concurrency,
    warmupSeconds,
    rounds: 3,
    seed: 421017,
    quietIdlePercent,
    serverCpu,
    clientCpu,
    outputRoot: values["output-root"],
    resumePath: values.resume,
    nileRevision: values["nile-revision"],
  };
}
