/** Preserve arithmetic means and medians; latency summaries describe trial quantiles. */
export function summarizeValues(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2;
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  return { mean, median, min: sorted[0], max: sorted.at(-1) };
}

/** Retain invalid and missing trials visibly instead of selecting only successful runs. */
export function summarizeScenario(results) {
  const expectedRounds =
    results.manifest.selectedRound === undefined
      ? Array.from({ length: results.manifest.rounds }, (_, index) => index + 1)
      : [results.manifest.selectedRound];
  const expected = expectedRounds.length;
  return results.manifest.frameworks.flatMap((framework) =>
    results.manifest.workload.concurrencies.map((concurrency) => {
      const trials = results.trials.filter(
        (trial) =>
          trial.phase === "measured" &&
          trial.framework === framework.name &&
          trial.concurrency === concurrency
      );
      const budgets = results.manifest.requestCounts;
      const invalidBudget = (trial) =>
        budgets !== undefined &&
        (!Number.isInteger(trial.round) ||
          !expectedRounds.includes(trial.round) ||
          trial.counters.requests !== budgets[trial.round - 1]);
      const warmupFailures = results.trials.filter(
        (trial) =>
          trial.phase === "warmup" &&
          trial.framework === framework.name &&
          trial.concurrency === concurrency &&
          (!trial.valid ||
            (results.manifest.selectedRound !== undefined &&
              trial.round !== results.manifest.selectedRound))
      ).length;
      const requests = trials.reduce(
        (sum, trial) => sum + trial.counters.requests,
        0
      );
      const invalidTrials = trials.filter(
        (trial) => !trial.valid || invalidBudget(trial)
      ).length;
      const failures = trials.reduce(
        (sum, trial) => sum + trial.counters.failed,
        0
      );
      const inputBytes = trials.reduce(
        (sum, trial) => sum + trial.counters.requestBodyBytes,
        0
      );
      const outputBytes = trials.reduce(
        (sum, trial) => sum + trial.counters.responseBodyBytes,
        0
      );
      return {
        framework: framework.name,
        runtime: framework.runtime,
        version: framework.version,
        concurrency,
        trialCount: trials.length,
        expected,
        invalidTrials,
        warmupFailures,
        failures,
        requests,
        expectedRequests:
          budgets === undefined
            ? undefined
            : expectedRounds.reduce(
                (sum, round) => sum + budgets[round - 1],
                0
              ),
        valid:
          results.completed === true &&
          trials.length === expected &&
          invalidTrials === 0 &&
          (!budgets ||
            new Set(trials.map((trial) => trial.round)).size === expected) &&
          warmupFailures === 0,
        throughput: summarizeValues(
          trials.map((trial) => trial.successfulPerSecond)
        ),
        p95: summarizeValues(trials.map((trial) => trial.latency.p95Ms)),
        p99: summarizeValues(trials.map((trial) => trial.latency.p99Ms)),
        requestBodyBytesPerOp: requests ? inputBytes / requests : null,
        responseBodyBytesPerOp: requests ? outputBytes / requests : null,
      };
    })
  );
}

/** Render plain Markdown evidence by workload and runtime with no global framework ranking. */
export function renderMatrixSummary({ report, resultsByMode }) {
  const number = (value) => (Number.isFinite(value) ? value.toFixed(2) : "—");
  const safeCell = (value) =>
    String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
  const lines = [
    "# Framework benchmark evidence",
    "",
    `Profile: **${report.config.profile}**. Runtime track: **${report.config.runtime}**. Suite completed: **${report.completed}**. Suite valid: **${report.valid}**.`,
    "",
    "Rows remain in manifest order. Count-mode rows use arithmetic mean successful requests/s with min–max; historical duration-mode rows use medians. All measured trials, including invalid trials, remain visible. p95/p99 columns use the same statistic across trial percentiles, not pooled request percentiles. Bytes/op aggregate attempted request body and consumed response body bytes, including failures; headers and network overhead are excluded.",
    "",
    "Every configured round is required: three for exact-count mode or five for duration mode. INVALID or INCOMPLETE rows cannot support a performance comparison. Warmup failures remain visible. Development results are harness checks, not publication evidence. Shared-machine, closed-loop results apply only to the named workload and runtime; they do not establish a universal fastest-framework claim.",
    "",
  ];
  if (report.failure)
    lines.push(`First failure: ${safeCell(report.failure)}`, "");
  for (const mode of ["plain", "validated"]) {
    const results = resultsByMode[mode];
    lines.push(`## ${mode}`, "");
    if (!results) {
      lines.push(
        "INCOMPLETE: no readable measured result file was produced for this mode.",
        ""
      );
      continue;
    }
    const statistic = results.manifest.requestCounts ? "mean" : "median";
    lines.push(
      `Generator complete: ${results.completed}; generator valid: ${results.valid ?? false}.`,
      "",
      `| Framework | Runtime | Concurrency | Trials | Validity | Successful req/s ${statistic} [min–max] | p95 ms | p99 ms | Failed requests | Invalid trials | Bad warmups | Req bytes/op | Resp bytes/op |`,
      "| --- | --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"
    );
    const rows = summarizeScenario(results);
    rows.forEach((row) => {
      const validity = row.valid
        ? "VALID"
        : row.trialCount < row.expected
          ? "INCOMPLETE"
          : "INVALID";
      const speed = row.throughput
        ? `${number(row.throughput[statistic])} [${number(row.throughput.min)}–${number(row.throughput.max)}]`
        : "—";
      lines.push(
        `| ${safeCell(row.framework)} | ${safeCell(row.runtime)} | ${row.concurrency} | ${row.trialCount}/${row.expected} | ${validity} | ${speed} | ${number(row.p95?.[statistic])} | ${number(row.p99?.[statistic])} | ${row.failures} | ${row.invalidTrials} | ${row.warmupFailures} | ${number(row.requestBodyBytesPerOp)} | ${number(row.responseBodyBytesPerOp)} |`
      );
    });
    lines.push("", "Versions tested:", "");
    results.manifest.frameworks.forEach((framework) =>
      lines.push(
        `- ${safeCell(framework.name)}: ${safeCell(framework.version)}; ${safeCell(framework.runtime)}`
      )
    );
    lines.push("");
  }
  lines.push("## Exclusions", "");
  report.exclusions.forEach(({ name, reason }) =>
    lines.push(`- ${safeCell(name)}: ${safeCell(reason)}`)
  );
  return `${lines.join("\n")}\n`;
}
