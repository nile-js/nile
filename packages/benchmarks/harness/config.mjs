const CODECS = ["json", "nile", "trpc"];
const CONCURRENCIES = [1, 30, 100, 300];

/** Fail fast on ambiguous benchmark inputs before making network requests. */
export function validateManifest(manifest) {
  if (
    !manifest ||
    !Array.isArray(manifest.frameworks) ||
    !manifest.frameworks.length
  )
    throw Error("frameworks must be a nonempty array");
  const names = new Set();
  manifest.frameworks.forEach((framework) => {
    if (!framework.name || names.has(framework.name))
      throw Error("framework names must be unique and nonempty");
    names.add(framework.name);
    if (!CODECS.includes(framework.codec))
      throw Error(`Unsupported codec for ${framework.name}`);
    const url = new URL(framework.url);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw Error("Only HTTP(S) URLs without credentials are allowed");
    if (!framework.runtime || !framework.version)
      throw Error("Every framework requires runtime and version metadata");
    if (
      typeof framework.pathTemplate !== "string" ||
      !framework.pathTemplate.startsWith("/") ||
      framework.pathTemplate.startsWith("//")
    )
      throw Error("pathTemplate must be an origin-relative path");
    if (
      framework.codec !== "nile" &&
      !framework.pathTemplate.includes("{action}")
    )
      throw Error("Route templates must rotate actions");
  });
  if (!manifest.workload?.name || manifest.workload.actionCount !== 300)
    throw Error("workload requires name and actionCount: 300");
  if (!["plain", "validated"].includes(manifest.workload.mode))
    throw Error("workload.mode must be plain or validated");
  if (
    manifest.workload.operation !== undefined &&
    !["memory-read", "sqlite-read", "sqlite-read-write"].includes(
      manifest.workload.operation
    )
  )
    throw Error("Unsupported workload.operation");
  if (
    !Array.isArray(manifest.workload.concurrencies) ||
    !manifest.workload.concurrencies.length ||
    manifest.workload.concurrencies.some(
      (value) => !CONCURRENCIES.includes(value)
    )
  )
    throw Error("concurrencies must contain 1, 30, 100, or 300");
  const isCountMode = manifest.requestCounts !== undefined;
  const timedFields = ["warmupSeconds", "timeoutSeconds"];
  if (!isCountMode || manifest.durationSeconds !== undefined)
    timedFields.push("durationSeconds");
  for (const field of timedFields) {
    if (!Number.isFinite(manifest[field]) || manifest[field] <= 0)
      throw Error(`${field} must be positive`);
  }
  if (manifest.rounds !== (isCountMode ? 3 : 5))
    throw Error("Use three count-mode rounds or five duration-mode rounds");
  if (
    isCountMode &&
    (!Array.isArray(manifest.requestCounts) ||
      manifest.requestCounts.length !== manifest.rounds ||
      manifest.requestCounts.some(
        (count) => !Number.isSafeInteger(count) || count < 300
      ))
  )
    throw Error("requestCounts requires one integer >=300 per round");
  if (
    manifest.selectedRound !== undefined &&
    (!isCountMode ||
      !Number.isInteger(manifest.selectedRound) ||
      manifest.selectedRound < 1 ||
      manifest.selectedRound > 3)
  )
    throw Error("selectedRound must be 1, 2, or 3 in count mode only");
  if (!Number.isSafeInteger(manifest.seed) || manifest.seed < 0)
    throw Error("seed must be a nonnegative safe integer");
  if (
    manifest.profile === "publication" &&
    ((!isCountMode && manifest.durationSeconds < 30) ||
      manifest.warmupSeconds < 5)
  )
    throw Error(
      "Publication requires 5s warmup and either exact counts or 30s measured per trial"
    );
  if (!["development", "publication"].includes(manifest.profile))
    throw Error("profile must be development or publication");
  return manifest;
}

/** Require explicit manifest and output locations to prevent accidental benchmark runs. */
export function readArguments(argumentsList) {
  const options = {};
  for (let index = 0; index < argumentsList.length; index += 2) {
    const name = argumentsList[index];
    const value = argumentsList[index + 1];
    if (
      !["--manifest", "--output"].includes(name) ||
      !value ||
      value.startsWith("--") ||
      options[name]
    )
      throw Error("Usage: node run.mjs --manifest FILE --output FILE");
    options[name] = value;
  }
  if (!options["--manifest"] || !options["--output"])
    throw Error("Both --manifest and --output are required");
  return {
    manifestPath: options["--manifest"],
    outputPath: options["--output"],
  };
}

/** Keep original round identities when a coordinator interleaves one count round at a time. */
export function selectManifestRounds(manifest) {
  return manifest.selectedRound === undefined
    ? Array.from({ length: manifest.rounds }, (_, index) => index + 1)
    : [manifest.selectedRound];
}
