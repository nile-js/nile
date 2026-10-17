/** Preserve each framework's native request and response protocol. */
export function createExchange({ framework, sequence, actionCount }) {
  const action = sequence % actionCount;
  const payload = { id: sequence, value: sequence % 1000 };
  const bodies = {
    json: () => payload,
    trpc: () => payload,
    nile: () => ({
      intent: "execute",
      service: "bench",
      action: `action-${action}`,
      payload,
    }),
  };
  const path = framework.pathTemplate.replaceAll("{action}", String(action));
  return {
    url: new URL(path, framework.url),
    body: JSON.stringify(bodies[framework.codec]()),
    expected: { ...payload, value: payload.value + 1, action },
  };
}

/** Return a graceful mismatch for malformed JSON or an unsuccessful native envelope. */
export function decodeResponse({ codec, body, expected }) {
  const parsed = safeTry(() => JSON.parse(body));
  if (!parsed.status) return { status: false, message: "invalid-json" };
  const readers = {
    json: (value) => value,
    nile: (value) => (value?.status === true ? value.data : null),
    trpc: (value) => value?.result?.data,
  };
  const value = readers[codec](parsed.data);
  const matches =
    value?.id === expected.id &&
    value?.value === expected.value &&
    value?.action === expected.action;
  return matches
    ? { status: true, data: value }
    : { status: false, message: "payload-mismatch" };
}

/** Contain anticipated parsing and configuration errors without framework dependencies. */
export function safeTry(operation) {
  try {
    return { status: true, data: operation() };
  } catch (error) {
    return {
      status: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
