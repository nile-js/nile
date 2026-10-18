/** Label real runtime artifacts rather than relying on the unchanged release version alone. */
export function describeFramework({
  cell,
  ready,
  config,
  provenance,
  dependencies,
}) {
  const packages = {
    elysia: "elysia",
    express: "express",
    fastify: "fastify",
    trpc: "@trpc/server",
    "nest-express": "@nestjs/core",
    "nest-fastify": "@nestjs/core",
    adonis: "@adonisjs/core",
    effect: "effect",
    hono: "hono",
    encore: "encore.dev",
  };
  const codec =
    cell.framework === "nile"
      ? "nile"
      : cell.framework === "trpc"
        ? "trpc"
        : "json";
  const version =
    cell.framework === "nile"
      ? `${provenance.nileVersion} source:${config.nileRevision} sha256:${provenance.nileArtifactSha256}`
      : cell.framework === "bun"
        ? ready.runtimeVersion
        : dependencies[packages[cell.framework]];
  if (
    !version ||
    !ready.runtimeVersion ||
    ready.nodeEnvironment !== "production" ||
    ready.framework !== cell.framework ||
    ready.mode !== cell.mode ||
    ready.runtime !== config.runtime ||
    ready.port !== 4100 ||
    ready.workloadMetadata?.workload !== cell.operation
  )
    throw Error(`Readiness/version mismatch: ${cell.framework}`);
  if (
    cell.operation !== "memory-read" &&
    (ready.workloadMetadata.sqliteSynchronous !== config.sqliteSynchronous ||
      ready.workloadMetadata.synchronous !==
        (config.sqliteSynchronous === "normal" ? 1 : 2))
  )
    throw Error(`SQLite durability mismatch: ${cell.framework}`);
  return {
    name: cell.framework,
    url: "http://127.0.0.1:4100",
    codec,
    pathTemplate:
      codec === "nile"
        ? "/api/services"
        : codec === "trpc"
          ? "/trpc/action-{action}"
          : "/actions/action-{action}",
    runtime: `${config.runtime} ${ready.runtimeVersion}`,
    nodeEnvironment: "production",
    version,
  };
}

/** Render means of three trials, retaining ranges and failed cells without selective ranking. */
export function renderReport(report) {
  const ordering =
    report.ordering === "interleaved-rounds"
      ? "All selected frameworks finish round 1 before round 2, then round 3; a seeded framework order rotates across rounds. Each trial uses a fresh fixture and database. Corrective selections contain only the explicitly listed scenarios."
      : "Framework order is seeded and randomized per cell; repeats are contiguous within a cell. Each cell starts from a fresh fixture and database.";
  const lines = [
    "# Current-framework request-count benchmark",
    "",
    `Status: ${report.completed ? "complete" : "incomplete"}; valid: ${report.valid}.`,
    "",
    `${report.config.requestBudget} measured requests per framework for a full six-cell matrix (a corrective subset uses its explicit per-cell allocations), with three repeats; warmup and correctness probes excluded. Only the current local Nile build is used. Server and generator share this PC on separate physical CPU cores, including each core's SMT siblings. ${ordering} SQLite uses fresh files, WAL and synchronous ${report.config.sqliteSynchronous.toUpperCase()}. Node and Bun use their respective built-in SQLite drivers and are separate runtime tracks.`,
    "",
    "| Framework | Workload | Validation | Mean successful req/s | Range | Mean trial p95 ms | Requests | Valid |",
    "|---|---|---|---:|---:|---:|---:|---|",
  ];
  for (const cell of report.cells) {
    const row = cell.summary;
    if (!row) {
      lines.push(
        `| ${cell.framework} | ${cell.operation} | ${cell.mode} | — | — | — | — | incomplete |`
      );
      continue;
    }
    const number = (value) => (Number.isFinite(value) ? value.toFixed(1) : "—");
    lines.push(
      `| ${cell.framework} | ${cell.operation} | ${cell.mode} | ${number(row.throughput?.mean)} | ${number(row.throughput?.min)}–${number(row.throughput?.max)} | ${number(row.p95?.mean)} | ${cell.measuredRequests} | ${row.valid} |`
    );
  }
  lines.push(
    "",
    "Trial quantiles are averaged across repeats, not pooled. Closed-loop timing can hide queued demand; these results do not establish a universal fastest-framework claim. Background CPU and swap samples, raw response counters, workload metadata and process telemetry accompany each cell. Warmups use the same DB file as their following measured work. The ordering description above states whether fresh seeds apply per cell or per round. Durable SQLite write performance can dominate framework differences.",
    ""
  );
  return lines.join("\n");
}
