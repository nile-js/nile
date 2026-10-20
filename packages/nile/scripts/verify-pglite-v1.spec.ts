import { test } from "bun:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { serve } from "bun";
import { Err, Ok, safeTry } from "slang-ts";
import z from "zod";
import { createNileSocketClient } from "../../client/src/socket-client";
import { createQueue } from "../controls/queue";
import { createAction } from "../engine/create-action";
import { createTopics } from "../messaging/topics";
import type { InferTopics } from "../messaging/types";
import { createNileServer, getContext } from "../nile/server";

const topics = createTopics({
  "orders.updated": {
    schema: z.object({ id: z.string(), total: z.number().nonnegative() }),
    scope: z.object({ organization: z.string() }),
  },
});
interface Actions {
  orders: { read: { id: string }; save: { id: string; total: number } };
}

// Explicitly selected by the owner: this fixture never reads application DB configuration.
test("isolated PGlite persists direct/HTTP/socket actions and streams committed updates", async () => {
  const directory = await mkdtemp("/tmp/nile-v1-pglite-");
  const db = new PGlite(join(directory, "database"));
  await db.exec(
    "CREATE TABLE orders (id text PRIMARY KEY, total integer NOT NULL); CREATE TABLE job_events (phase text NOT NULL)"
  );
  const queue = createQueue({
    task: (id: string) =>
      db.query<{ id: string; total: number }>(
        "SELECT * FROM orders WHERE id = $1",
        [id]
      ),
  });
  const app = await createNileServer({
    serverName: "PGlite verification",
    runtime: "bun",
    native: true,
    forceNewInstance: true,
    logServices: false,
    rest: { baseUrl: "/api", allowedOrigins: [], discovery: { enabled: true } },
    execution: { timeoutMs: 5000 },
    websocket: {
      topics,
      authenticate: (_request, auth) =>
        Ok({ session: { organization: auth.organization ?? "shop" } }),
      authorizeSubscription: ({ scope, identity }) =>
        Ok(scope.organization === identity.session?.organization),
    },
    schedules: {
      jobs: [
        {
          name: "count-orders",
          schedule: { every: "1d" },
          handler: () => safeTry(() => db.query("SELECT count(*) FROM orders")),
        },
      ],
      onRunEvent: async ({ phase }) => {
        await db.query("INSERT INTO job_events (phase) VALUES ($1)", [phase]);
      },
    },
    services: [
      {
        name: "orders",
        description: "Orders",
        actions: [
          createAction<{ id: string; total: number }>({
            name: "save",
            description: "Save an order",
            validation: z.object({
              id: z.string().min(1),
              total: z.number().int().nonnegative(),
            }),
            handler: (input) =>
              safeTry(async () => {
                await db.transaction(async (transaction) => {
                  await transaction.query(
                    "INSERT INTO orders (id, total) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET total = $2",
                    [input.id, input.total]
                  );
                });
                const published = await getContext({ topics }).websocket.send({
                  topic: "orders.updated",
                  scope: { organization: "shop" },
                  data: input,
                });
                if (published.isErr) {
                  return Err("Order saved but update could not be published");
                }
                return Ok(input);
              }),
          }),
          createAction<{ id: string }>({
            name: "read",
            description: "Read an order",
            validation: z.object({ id: z.string().min(1) }),
            handler: ({ id }) =>
              safeTry(async () => {
                const selected = await queue.run(id);
                if (selected.isErr) {
                  return selected;
                }
                return Ok(selected.value.rows[0] ?? null);
              }),
          }),
        ],
      },
    ],
  });
  if (!app.websocket?.bun) {
    throw new Error("Bun socket adapter missing");
  }
  const listener = serve({
    hostname: "127.0.0.1",
    port: 0,
    idleTimeout: app.websocket.idleTimeout,
    fetch: app.fetch,
    websocket: app.websocket.bun,
  });
  const baseUrl = `http://127.0.0.1:${listener.port}`;
  const socket = createNileSocketClient<Actions, InferTopics<typeof topics>>({
    baseUrl,
    timeout: 3000,
  });
  const other = createNileSocketClient<Actions, InferTopics<typeof topics>>({
    baseUrl,
    auth: { organization: "other" },
    timeout: 3000,
  });
  const checked = await safeTry(async () => {
    const saved = await app.invoke({
      service: "orders",
      action: "save",
      payload: { id: "order-1", total: 10 },
    });
    assert.equal(saved.isOk, true);
    const received = new Promise<number>((resolve) => {
      const timer = setTimeout(() => resolve(-1), 3000);
      socket
        .receive({
          topic: "orders.updated",
          scope: { organization: "shop" },
          onMessage: ({ data }) => {
            clearTimeout(timer);
            resolve(data.total);
          },
        })
        .then((result) => {
          assert.equal(result.error, null);
        });
    });
    // Confirm registration before exercising the concurrent HTTP publisher.
    const registered = await socket.receive({
      topic: "orders.updated",
      scope: { organization: "shop" },
      onMessage: () => undefined,
    });
    assert.equal(registered.error, null);
    const post = (total: number) =>
      fetch(`${baseUrl}/api/services`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          intent: "execute",
          service: "orders",
          action: "save",
          payload: { id: "order-1", total },
        }),
      });
    assert.equal((await post(20)).status, 200);
    assert.equal(await received, 20);
    const read = await socket.invoke({
      service: "orders",
      action: "read",
      payload: { id: "order-1" },
    });
    assert.equal(read.error, null);
    assert.equal(read.data?.total, 20);
    assert.equal((await post(-1)).status, 400);
    assert.equal(
      (
        await other.receive({
          topic: "orders.updated",
          scope: { organization: "shop" },
          onMessage: () => undefined,
        })
      ).data,
      null
    );
    assert.equal(
      (
        await socket.send({
          topic: "orders.updated",
          scope: { organization: "shop" },
          data: { id: "order-1", total: 999 },
        })
      ).data,
      null
    );
    const persisted = await db.query<{ total: number }>(
      "SELECT total FROM orders WHERE id = $1",
      ["order-1"]
    );
    assert.equal(persisted.rows[0]?.total, 20);
    assert.equal((await app.scheduler?.runNow("count-orders"))?.isOk, true);
    const history = await db.query("SELECT phase FROM job_events");
    assert.equal(history.rows.length, 2);
    const exported = await app.schema({
      path: join(directory, "schemas.json"),
    });
    assert.equal(exported.isOk, true);
  });
  socket.close();
  other.close();
  queue.stop();
  await queue.drain();
  queue.close();
  const shutdown = await app.lifecycle.shutdown();
  await listener.stop(true);
  await db.close();
  assert.deepEqual(shutdown.errors, []);
  if (checked.isErr) {
    throw new Error(String(checked.error));
  }
  console.log(`PGlite verification passed; isolated artifacts: ${directory}`);
}, 30_000);
