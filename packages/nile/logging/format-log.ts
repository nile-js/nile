interface DisplayLog {
  time: string;
  level: string;
  atFunction: string;
  message: string;
  requestId?: string;
  runId?: string;
  traceId?: string;
}

/** Present the useful execution story before optional correlation details. */
export function formatLog(record: DisplayLog): string {
  const headline = `${record.time.slice(11, 23)} ${record.level.toUpperCase().padEnd(5)} ${record.atFunction} ${record.message}`;
  const details = [
    record.requestId ? `request=${record.requestId}` : "",
    record.runId ? `run=${record.runId}` : "",
    record.traceId ? `trace=${record.traceId}` : "",
  ].filter(Boolean);
  return details.length
    ? `${headline}\n             ${details.join("  ")}`
    : headline;
}
