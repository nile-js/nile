import assert from "node:assert/strict";
import test from "node:test";
import { createAdonis } from "../compiled/adonis.js";
import { createNest } from "../compiled/nest.js";

for (const mode of ["plain", "validated"]) {
  test(`Nest Fastify ${mode}: all 300 native routes without listening`, async (t) => {
    const app = await createNest({ host: "fastify", mode });
    t.after(() => app.close());
    const instance = app.getHttpAdapter().getInstance();

    for (let action = 0; action < 300; action += 1) {
      const response = await instance.inject({
        method: "POST",
        url: `/actions/action-${action}`,
        payload: { id: action, value: 999 },
      });
      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.json(), {
        id: action,
        value: 1000,
        action,
      });
    }

    if (mode === "validated") {
      const invalidInputs = [
        { id: -1, value: 0 },
        { id: Number.MAX_SAFE_INTEGER + 1, value: 0 },
        { id: 0, value: 1000 },
        { id: 0, value: 1.5 },
        { id: 0, value: "1" },
      ];
      for (const payload of invalidInputs) {
        const response = await instance.inject({
          method: "POST",
          url: "/actions/action-0",
          payload,
        });
        assert.equal(response.statusCode, 400);
      }
    }

    assert.equal(app.getHttpServer().listening, false);
  });

  test(`Nest Express ${mode}: 300 registered POST routes without listening`, async (t) => {
    const app = await createNest({ host: "express", mode });
    t.after(() => app.close());
    const routes = app
      .getHttpAdapter()
      .getInstance()
      .router.stack.filter((entry) => entry.route?.methods.post)
      .map((entry) => entry.route.path);

    assert.deepEqual(
      routes,
      Array.from({ length: 300 }, (_, action) => `/actions/action-${action}`)
    );
    assert.equal(app.getHttpServer().listening, false);
  });

  test(`Adonis ${mode}: normal provider lifecycle and 300 routes without listening`, async (t) => {
    const fixture = await createAdonis({ mode });
    t.after(() => fixture.close());
    const routes = fixture.server.getRouter().toJSON().root;

    assert.equal(fixture.app.getState(), "ready");
    assert.equal(fixture.server.booted, true);
    assert.equal(routes.length, 300);
    assert.deepEqual(
      routes.map((route) => route.pattern),
      Array.from({ length: 300 }, (_, action) => `/actions/action-${action}`)
    );
    assert.equal(fixture.nodeServer.listening, false);
  });
}
