import assert from "node:assert/strict";
import { createFastify } from "../adapters/fastify.mjs";
import { createNile } from "../adapters/nile.mjs";
import { createTrpc } from "../adapters/trpc.mjs";
import { createExpress } from "../adapters/express.mjs";
import { createElysia } from "../adapters/elysia.mjs";

for (const mode of ["plain", "validated"]) {
  const fastify = await createFastify({ mode });
  const trpc = createTrpc({ mode });
  const caller = trpc.router.createCaller({});
  const express = createExpress({ mode });
  const elysia = createElysia({ mode });
  assert.equal(express.router.stack.filter((layer) => layer.route).length, 300);
  assert.equal(fastify.server.listening, false);
  assert.equal(trpc.server.listening, false);
  const servers = await Promise.all(
    [false, true].map((released) => createNile({ mode, released }))
  );
  for (const action of Array.from({ length: 300 }, (_, action) => action)) {
    const payload = { id: action, value: action % 1000 };
    const expected = { id: action, value: payload.value + 1, action };
    const response = await fastify.inject({
      method: "POST",
      url: `/actions/action-${action}`,
      payload,
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), expected);
    assert.deepEqual(await caller[`action-${action}`](payload), expected);
    const elysiaResponse = await elysia.handle(
      new Request(`http://benchmark.invalid/actions/action-${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      })
    );
    assert.equal(elysiaResponse.status, 200);
    assert.deepEqual(await elysiaResponse.json(), expected);
    for (const server of servers) {
      const nileResponse = await server.rest.app.request("/api/services", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          intent: "execute",
          service: "bench",
          action: `action-${action}`,
          payload,
        }),
      });
      assert.equal(nileResponse.status, 200);
      assert.deepEqual((await nileResponse.json()).data, expected);
    }
  }
  if (mode === "validated") {
    const response = await fastify.inject({
      method: "POST",
      url: "/actions/action-0",
      payload: { id: -1, value: 1 },
    });
    assert.equal(response.statusCode, 400);
    await assert.rejects(() => caller["action-0"]({ id: -1, value: 1 }));
  }
  await fastify.close();
}
console.log(
  "Core fixtures: plain/validated route identity, common validation, released/current Nile and non-listening initialization PASS"
);
