import assert from "node:assert/strict";
import { sign } from "hono/jwt";
import { safeTry } from "slang-ts";
import { checkAdmission, prepareJourneys, runLoad } from "../client.mjs";
import { createJourney, SECRET } from "../workload.mjs";
import { createEffectFixture } from "./effect-fixture.mjs";

const runtime = process.argv[2] ?? "node";

/** Confirm the transport rejects a different authenticated customer accessing another cart. */
async function checkOwnership(connection) {
  const cart = createJourney(0, "owner")[2];
  const created = await fetch(`${connection.url}${cart.path}`, {
    method: "POST",
    headers: connection.headers,
    body: JSON.stringify(cart.payload),
  });
  assert.equal(created.status, 200);
  await created.text();
  const token = await sign(
    {
      sub: "intruder",
      organizationId: "benchmark",
      exp: Math.floor(Date.now() / 1000) + 60,
    },
    SECRET,
    "HS256",
  );
  const quote = createJourney(0, "owner")[3];
  const denied = await fetch(`${connection.url}${quote.path}`, {
    method: "POST",
    headers: { ...connection.headers, authorization: `Bearer ${token}` },
    body: JSON.stringify(quote.payload),
  });
  assert.equal(denied.status, 400);
  assert.deepEqual(await denied.json(), {
    status: false,
    message: "Cart not found",
    data: {},
  });
}

/** Cover all native Effect routes without sockets, then verify the real platform layer and cleanup. */
async function verifyFixture(mode) {
  const fixture = await createEffectFixture({ mode, runtime });
  assert.equal(fixture.routeCount, 300);
  const web = fixture.createWebHandler();
  const checked = await safeTry(async () => {
    for (const journey of prepareJourneys("effect", 50, "web")) {
      for (const step of journey) {
        const response = await web.handler(
          new Request(`http://localhost${step.path}`, {
            method: "POST",
            headers: fixture.headers,
            body: step.body,
          }),
        );
        assert.equal(response.status, 200);
        assert.equal(await response.text(), step.expected);
      }
    }
    assert.deepEqual(fixture.state(), { carts: 0, orders: 50 });
  });
  await web.dispose();
  if (checked.isErr) throw checked.error;
  fixture.reset();
  assert.deepEqual(fixture.state(), { carts: 0, orders: 0 });
  const server = await fixture.start();
  const connection = { url: server.url, headers: fixture.headers };
  const outcome = await safeTry(async () => {
    await checkAdmission(connection, "effect", mode);
    fixture.reset();
    const metrics = await runLoad(
      connection,
      prepareJourneys("effect", 50, "socket"),
    );
    assert.equal(metrics.requests, 300);
    assert.deepEqual(fixture.state(), { carts: 0, orders: 50 });
    await checkOwnership(connection);
    fixture.reset();
    assert.deepEqual(fixture.state(), { carts: 0, orders: 0 });
  });
  await server.close();
  if (outcome.isErr) throw outcome.error;
  console.log(
    JSON.stringify({
      passed: true,
      fixture: "effect",
      runtime,
      node: process.versions.node,
      bun: process.versions.bun ?? null,
      mode,
      routes: 300,
      nativeServer: true,
    }),
  );
}

for (const mode of ["plain", "validated"]) await verifyFixture(mode);
