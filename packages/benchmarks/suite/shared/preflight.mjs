import {
  createExchange,
  decodeResponse,
  safeTry,
} from "../../harness/codecs.mjs";

/** Verify fixed loopback targets before an owner-run launcher sends traffic. */
export function assertLoopbackTarget(url) {
  const parsed = new URL(url);
  if (
    parsed.protocol !== "http:" ||
    parsed.hostname !== "127.0.0.1" ||
    parsed.username ||
    parsed.password
  )
    throw Error(
      "Suite targets must be uncredentialed http://127.0.0.1 endpoints"
    );
}

/** Reject every malformed payload through native status/envelope semantics. */
export function isRejectedResponse({ codec, response }) {
  if (!response.status) return false;
  if (response.statusCode >= 400 && response.statusCode < 500) return true;
  if (codec !== "nile" || response.statusCode !== 200) return false;
  const parsed = safeTry(() => JSON.parse(response.body));
  return parsed.status && parsed.data?.status === false;
}

/** Verify all routes and invalid validated input before measuring; inject transport for pure tests. */
export async function preflightFramework({ framework, mode, request }) {
  assertLoopbackTarget(framework.url);
  const checked = {
    framework: framework.name,
    mode,
    validActions: 0,
    invalidCases: 0,
    status: false,
  };
  for (let action = 0; action < 300; action += 1) {
    const exchange = createExchange({
      framework,
      sequence: action,
      actionCount: 300,
    });
    const response = await request(exchange);
    if (
      !response.status ||
      response.statusCode !== 200 ||
      !decodeResponse({
        codec: framework.codec,
        body: response.body,
        expected: exchange.expected,
      }).status
    )
      throw Error(
        `Preflight failed: ${framework.name} action-${action} does not return the matched payload and action identity`
      );
    checked.validActions += 1;
  }
  if (mode === "validated") {
    const invalidPayloads = [
      { id: -1, value: 1 },
      { id: 0.5, value: 1 },
      { id: Number.MAX_SAFE_INTEGER + 1, value: 1 },
      { id: 1, value: -1 },
      { id: 1, value: 1000 },
      { id: 1, value: 1.5 },
      { id: "1", value: 1 },
      { id: 1, value: "1" },
      { id: 1 },
      {},
    ];
    for (const action of [0, 149, 299]) {
      for (const payload of invalidPayloads) {
        const exchange = createExchange({
          framework,
          sequence: action,
          actionCount: 300,
        });
        exchange.body =
          framework.codec === "nile"
            ? JSON.stringify({
                intent: "execute",
                service: "bench",
                action: `action-${action}`,
                payload,
              })
            : JSON.stringify(payload);
        const response = await request(exchange);
        if (!isRejectedResponse({ codec: framework.codec, response }))
          throw Error(
            `Preflight failed: ${framework.name} validated action-${action} accepted invalid input or failed with a transport/server error`
          );
        checked.invalidCases += 1;
      }
    }
  }
  return { ...checked, status: true };
}
