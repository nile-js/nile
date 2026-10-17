import assert from "node:assert/strict";
import test from "node:test";
import { createEffectWebHandler } from "../adapters/effect.mjs";

/** Exercise the actual Effect router without starting an HTTP listener. */
const sendRequest = ({ app, action, body }) =>
  app.handler(
    new Request(`http://localhost/actions/action-${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );

for (const mode of ["plain", "validated", "native"]) {
  test(`Effect ${mode}: all 300 registered routes preserve action identity`, async () => {
    const app = createEffectWebHandler({ mode });
    const responses = await Promise.all(
      Array.from({ length: 300 }, async (_, action) => {
        const response = await sendRequest({
          app,
          action,
          body: { id: action, value: 999 },
        });
        assert.equal(response.status, 200);
        return response.json();
      })
    );
    assert.deepEqual(
      responses,
      Array.from({ length: 300 }, (_, action) => ({
        id: action,
        value: 1000,
        action,
      }))
    );
    const malformed = await sendRequest({ app, action: 0, body: "{" });
    assert.equal(malformed.status, 400);
    await app.dispose();
  });
}

for (const mode of ["validated", "native"]) {
  test(`Effect ${mode}: identical integer and bounds validation`, async () => {
    const app = createEffectWebHandler({ mode });
    const invalidBodies = [
      {},
      null,
      { id: "1", value: 2 },
      { id: -1, value: 2 },
      { id: 0.5, value: 2 },
      { id: Number.MAX_SAFE_INTEGER + 1, value: 2 },
      { id: 1, value: -1 },
      { id: 1, value: 1000 },
      { id: 1, value: 0.5 },
    ];
    for (const body of invalidBodies) {
      const response = await sendRequest({ app, action: 299, body });
      assert.equal(response.status, 400, JSON.stringify(body));
    }
    for (const body of [
      { id: 0, value: 0 },
      { id: Number.MAX_SAFE_INTEGER, value: 999 },
    ]) {
      const response = await sendRequest({ app, action: 0, body });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        id: body.id,
        value: body.value + 1,
        action: 0,
      });
    }
    await app.dispose();
  });
}

test("Effect rejects unsupported configuration before any listener exists", () => {
  assert.throws(() => createEffectWebHandler({ mode: "typo" }), /Unsupported/);
});
