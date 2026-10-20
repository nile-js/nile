import { safeTry } from "slang-ts";
import { createJourney, ORIGIN, serializeResult } from "./workload.mjs";
import { Ok } from "slang-ts";

export const CONCURRENCY = 32;
export const WARMUP = 500;
export const JOURNEYS = 5000;

/** Precompute bodies and expectations outside timing, retaining each framework's actual public protocol. */
export function prepareJourneys(framework, count, phase) {
  return Array.from({ length: count }, (_, sequence) =>
    createJourney(sequence, phase).map((step) => ({
      path: framework.startsWith("nile-") ? "/api/services" : step.path,
      body: JSON.stringify(
        framework.startsWith("nile-")
          ? {
              intent: "execute",
              service: step.shop,
              action: step.operation,
              payload: step.payload,
            }
          : step.payload
      ),
      expected: JSON.stringify(
        serializeResult(step.shop, step.operation, Ok(step.expected))
      ),
    }))
  );
}

/** Fully consume and verify every response; failed requests never count as successful throughput. */
async function requestStep(connection, step) {
  const response = await fetch(`${connection.url}${step.path}`, {
    method: "POST",
    headers: connection.headers,
    body: step.body,
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.text();
  if (response.status !== 200 || body !== step.expected) {
    throw new Error(
      `Response mismatch HTTP ${response.status}: ${body.slice(0, 250)}`
    );
  }
}

/** Execute dependent shopping steps sequentially inside each concurrent customer's journey. */
export async function runLoad(connection, plans) {
  let cursor = 0;
  let failed = false;
  const latencies = [];
  const requestLatencies = [];
  const begin = performance.now();
  const outcomes = await Promise.all(
    Array.from({ length: CONCURRENCY }, () =>
      safeTry(async () => {
        while (!failed && cursor < plans.length) {
          const journey = plans[cursor++];
          const journeyStart = performance.now();
          const result = await safeTry(async () => {
            for (const step of journey) {
              const requestStart = performance.now();
              await requestStep(connection, step);
              requestLatencies.push(performance.now() - requestStart);
            }
          });
          if (result.isErr) {
            failed = true;
            throw new Error(String(result.error));
          }
          latencies.push(performance.now() - journeyStart);
        }
      })
    )
  );
  const failure = outcomes.find((result) => result.isErr);
  if (failure) {
    throw new Error(String(failure.error));
  }
  const elapsedMs = performance.now() - begin;
  if (
    latencies.length !== plans.length ||
    requestLatencies.length !== plans.length * 6
  ) {
    throw new Error("Incomplete journey count");
  }
  latencies.sort((a, b) => a - b);
  requestLatencies.sort((a, b) => a - b);
  return {
    elapsedMs,
    journeys: plans.length,
    requests: requestLatencies.length,
    requestsPerSecond: (requestLatencies.length * 1000) / elapsedMs,
    journeysPerSecond: (plans.length * 1000) / elapsedMs,
    journeyP50Ms: latencies[Math.ceil(latencies.length * 0.5) - 1],
    journeyP95Ms: latencies[Math.ceil(latencies.length * 0.95) - 1],
    requestP95Ms:
      requestLatencies[Math.ceil(requestLatencies.length * 0.95) - 1],
  };
}

/** Admission checks catch missing security/validation before timing real application requests. */
export async function checkAdmission(connection, framework, mode) {
  const step = prepareJourneys(framework, 1, "admission")[0][0];
  await runLoad(connection, prepareJourneys(framework, 1, "admission"));
  const preflight = await fetch(`${connection.url}${step.path}`, {
    method: "OPTIONS",
    headers: {
      origin: ORIGIN,
      "access-control-request-method": "POST",
      "access-control-request-headers": "authorization,content-type",
    },
    signal: AbortSignal.timeout(10_000),
  });
  await preflight.text();
  if (
    preflight.status !== 204 ||
    preflight.headers.get("access-control-allow-origin") !== ORIGIN
  ) {
    throw new Error("Preflight admission failed");
  }
  const authorized = await fetch(`${connection.url}${step.path}`, {
    method: "POST",
    headers: connection.headers,
    body: step.body,
    signal: AbortSignal.timeout(10_000),
  });
  await authorized.text();
  if (authorized.headers.get("access-control-allow-origin") !== ORIGIN) {
    throw new Error("CORS admission failed");
  }
  const unauthorized = await fetch(`${connection.url}${step.path}`, {
    method: "POST",
    headers: { ...connection.headers, authorization: "" },
    body: step.body,
    signal: AbortSignal.timeout(10_000),
  });
  const denied = await unauthorized.json();
  if (unauthorized.status !== 400 || denied.status !== false) {
    throw new Error("Unauthenticated request accepted");
  }
  if (mode !== "validated") {
    return;
  }
  const invalidBody = JSON.stringify(
    framework.startsWith("nile-")
      ? {
          intent: "execute",
          service: "shop-0",
          action: "catalog",
          payload: { page: -1 },
        }
      : { page: -1 }
  );
  const invalid = await fetch(`${connection.url}${step.path}`, {
    method: "POST",
    headers: connection.headers,
    body: invalidBody,
    signal: AbortSignal.timeout(10_000),
  });
  await invalid.text();
  if (invalid.status !== 400) {
    throw new Error("Invalid input accepted");
  }
}
