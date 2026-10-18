import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorkload } from "../shared/workload-store.mjs";
import { createNile } from "../adapters/nile.mjs";
import { createFastify } from "../adapters/fastify.mjs";
import { createExpress } from "../adapters/express.mjs";
import { createElysia } from "../adapters/elysia.mjs";
import { createTrpc } from "../adapters/trpc.mjs";
import { createHono } from "../adapters/hono.mjs";
import { createBunHandler } from "../adapters/bun.mjs";
import { createEffectWebHandler } from "../adapters/effect.mjs";
import { createNest } from "../compiled/nest.js";
import { registerRoutes } from "../compiled/adonis/routes.js";

/** Prove every adapter executes the injected real transaction instead of its compatibility fallback. */
for (const mode of ["plain", "validated"]) {
  test(`all adapters invoke shared SQLite operation: ${mode}`, async () => {
    const directory = mkdtempSync(join(tmpdir(), "nile-benchmark-injection-"));
    const databasePath = join(directory, "fixture.sqlite");
    const store = await createWorkload({
      workload: "sqlite-read-write",
      databasePath,
    });
    let calls = 0;
    const execute = (input) => {
      calls += 1;
      return store.execute(input);
    };
    const options = { mode, execute };
    const payload = { id: 42, value: 999 };
    const expected = { id: 42, value: 1000, action: 299 };
    const request = () =>
      new Request("http://benchmark.invalid/actions/action-299", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
    const nile = await createNile(options);
    const nileResponse = await nile.rest.app.request("/api/services", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        intent: "execute",
        service: "bench",
        action: "action-299",
        payload,
      }),
    });
    assert.deepEqual((await nileResponse.json()).data, expected);
    const fastify = await createFastify(options);
    assert.deepEqual(
      (
        await fastify.inject({
          method: "POST",
          url: "/actions/action-299",
          payload,
        })
      ).json(),
      expected
    );
    await fastify.close();
    const express = createExpress(options);
    const route = express.router.stack.find(
      (layer) => layer.route?.path === "/actions/action-299"
    ).route;
    route.stack[0].handle(
      { body: payload },
      { json: (result) => assert.deepEqual(result, expected) }
    );
    const elysia = createElysia(options);
    assert.deepEqual(await (await elysia.handle(request())).json(), expected);
    const trpc = createTrpc(options);
    assert.deepEqual(
      await trpc.router.createCaller({})["action-299"](payload),
      expected
    );
    assert.deepEqual(
      await (await createHono(options).fetch(request())).json(),
      expected
    );
    assert.deepEqual(
      await (await createBunHandler(options)(request())).json(),
      expected
    );
    const effect = createEffectWebHandler(options);
    assert.deepEqual(await (await effect.handler(request())).json(), expected);
    await effect.dispose();
    const nest = await createNest({ ...options, host: "fastify" });
    assert.deepEqual(
      (
        await nest
          .getHttpAdapter()
          .getInstance()
          .inject({ method: "POST", url: "/actions/action-299", payload })
      ).json(),
      expected
    );
    await nest.close();
    const handlers = new Map();
    registerRoutes({
      ...options,
      router: { post: (path, handler) => handlers.set(path, handler) },
    });
    assert.deepEqual(
      handlers.get("/actions/action-299")({ request: { body: () => payload } }),
      expected
    );
    assert.equal(calls, 10);
    const { DatabaseSync } = await import("node:sqlite");
    const observer = new DatabaseSync(databasePath, { readOnly: true });
    assert.equal(
      observer.prepare("SELECT writes FROM benchmark_rows WHERE id=999").get()
        .writes,
      10
    );
    observer.close();
    store.close();
  });
}
