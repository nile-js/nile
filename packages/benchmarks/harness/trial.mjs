import { performance } from "node:perf_hooks";
import { createExchange, decodeResponse } from "./codecs.mjs";
import { createLatencyRecorder } from "./statistics.mjs";

/** Count overlapping error categories, while total failed requests remains a union. */
export function accountResponse({ counters, response, exchange, codec }) {
  counters.requests += 1;
  counters.requestBodyBytes += Buffer.byteLength(exchange.body);
  counters.responseBodyBytes += response.responseBytes ?? 0;
  if (!response.status) {
    counters.failed += 1;
    const keys = {
      timeout: "timeouts",
      network: "networkErrors",
      oversized: "oversizedResponses",
    };
    counters[keys[response.kind] ?? "networkErrors"] += 1;
    return;
  }
  const valid = decodeResponse({
    codec,
    body: response.body,
    expected: exchange.expected,
  });
  const isNon200 = response.statusCode !== 200;
  if (isNon200) counters.non200 += 1;
  if (!valid.status) counters.mismatches += 1;
  if (isNon200 || !valid.status) {
    counters.failed += 1;
    return;
  }
  counters.successful += 1;
}

/** Run a timed or exact-budget trial; shared issuance prevents concurrent overshoot. */
export async function runTrial({
  framework,
  workload,
  concurrency,
  durationSeconds,
  requestCount,
  request,
  now = () => performance.now(),
}) {
  if (
    requestCount !== undefined &&
    (!Number.isSafeInteger(requestCount) || requestCount <= 0)
  )
    throw Error("requestCount must be a positive safe integer");
  if (
    requestCount === undefined &&
    (!Number.isFinite(durationSeconds) || durationSeconds <= 0)
  )
    throw Error("durationSeconds must be finite and positive for timed trials");
  const counters = {
    requests: 0,
    successful: 0,
    failed: 0,
    timeouts: 0,
    networkErrors: 0,
    oversizedResponses: 0,
    non200: 0,
    mismatches: 0,
    requestBodyBytes: 0,
    responseBodyBytes: 0,
  };
  const latency = createLatencyRecorder();
  let sequence = 0;
  const cpuStarted = process.cpuUsage();
  const started = now();
  const deadline = started + durationSeconds * 1000;
  const worker = async () => {
    // No await occurs between the shared limit check and sequence reservation.
    while (
      requestCount === undefined ? now() < deadline : sequence < requestCount
    ) {
      const exchange = createExchange({
        framework,
        sequence: sequence++,
        actionCount: workload.actionCount,
      });
      const requestStarted = now();
      const response = await request(exchange);
      const completed = now();
      latency.record(completed - requestStarted);
      accountResponse({ counters, response, exchange, codec: framework.codec });
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  const elapsedSeconds = (now() - started) / 1000;
  const clientCpu = process.cpuUsage(cpuStarted);
  return {
    framework: framework.name,
    ...(workload.operation ? { operation: workload.operation } : {}),
    concurrency,
    durationSeconds,
    ...(requestCount === undefined ? {} : { requestCount }),
    elapsedSeconds,
    clientCpu: {
      ...clientCpu,
      percentOfOneCore:
        (clientCpu.user + clientCpu.system) / (elapsedSeconds * 10000),
    },
    drainSeconds:
      requestCount === undefined
        ? Math.max(0, elapsedSeconds - durationSeconds)
        : 0,
    counters,
    requestsPerSecond: counters.requests / elapsedSeconds,
    successfulPerSecond: counters.successful / elapsedSeconds,
    latency: latency.snapshot(),
    valid:
      counters.failed === 0 &&
      counters.requests > 0 &&
      (requestCount === undefined || counters.requests === requestCount),
    actionCoverage: Math.min(sequence, workload.actionCount),
  };
}
