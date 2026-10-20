import { prepareJourneys, runLoad } from "../client.mjs";
import { ORIGIN } from "../workload.mjs";

/** Retain tRPC's native mutation path/envelope while matching the same application data and six-step journey. */
export function prepareFullJourneys(name, count, phase) {
  const plans = prepareJourneys(name, count, phase);
  if (name !== "trpc") {
    return plans;
  }
  return plans.map((plan) =>
    plan.map((step) => {
      const [, , shop, operation] = step.path.split("/");
      return {
        ...step,
        path: `/trpc/${shop}.${operation}`,
        expected: JSON.stringify({
          result: { data: JSON.parse(step.expected) },
        }),
      };
    }),
  );
}

/** Admit the actual protocol, authorization, payload validation and CORS before any timing samples. */
export async function checkFullAdmission(connection, name, mode) {
  const plans = prepareFullJourneys(name, 50, "admission");
  await runLoad(connection, plans);
  const step = plans[0][0];
  const options = { signal: AbortSignal.timeout(10_000) };
  const preflight = await fetch(`${connection.url}${step.path}`, {
    ...options,
    method: "OPTIONS",
    headers: {
      origin: ORIGIN,
      "access-control-request-method": "POST",
      "access-control-request-headers": "authorization,content-type",
    },
  });
  await preflight.text();
  // Encore Rust handles valid HTTP 200 preflight before raw endpoint handlers.
  const validPreflight =
    preflight.status === 204 || (name === "encore" && preflight.status === 200);
  if (
    !validPreflight ||
    preflight.headers.get("access-control-allow-origin") !== ORIGIN
  ) {
    throw new Error("Preflight admission failed");
  }
  const good = await fetch(`${connection.url}${step.path}`, {
    ...options,
    method: "POST",
    headers: connection.headers,
    body: step.body,
  });
  await good.text();
  if (
    good.status !== 200 ||
    good.headers.get("access-control-allow-origin") !== ORIGIN
  ) {
    throw new Error("Authorized/CORS admission failed");
  }
  const denied = await fetch(`${connection.url}${step.path}`, {
    ...options,
    method: "POST",
    headers: { ...connection.headers, authorization: "Bearer invalid" },
    body: step.body,
  });
  const denial = await denied.json();
  if (
    denied.status !== 400 ||
    (name === "trpc" ? !denial.error : denial.status !== false)
  ) {
    throw new Error("Invalid JWT accepted");
  }
  if (mode !== "validated") {
    return;
  }
  const payload = { page: -1 };
  const body = JSON.stringify(
    name.startsWith("nile-")
      ? { intent: "execute", service: "shop-0", action: "catalog", payload }
      : payload,
  );
  const invalid = await fetch(`${connection.url}${step.path}`, {
    ...options,
    method: "POST",
    headers: connection.headers,
    body,
  });
  await invalid.text();
  if (invalid.status !== 400) {
    throw new Error("Invalid payload accepted");
  }
}
