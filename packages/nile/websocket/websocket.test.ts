import { createServer } from "node:http";
import { getRequestListener } from "@hono/node-server";
import { sign } from "hono/jwt";
import { Ok, safeTry } from "slang-ts";
import { describe, expect, it } from "vitest";
import z from "zod";
import { createNileClient } from "../../client/src/create-client";
import { createAction } from "../engine/create-action";
import { createTopic, createTopics } from "../messaging/topics";
import type { InferTopics, Message } from "../messaging/types";
import { createNileServer, getContext } from "../nile/server";

const SECRET = "socket-test-secret";

const ordersUpdated = createTopic({
  name: "orders.updated",
  data: z.object({
    id: z.string(),
    value: z.number().nonnegative(),
    raw: z.string().optional(),
    nested: z
      .object({ raw: z.string().optional(), keep: z.number() })
      .optional(),
  }),
  scope: z.object({ organization: z.string() }),
  canReceive: ({ scope, user }) => scope.organization === user?.organizationId,
  canSend: ({ scope, user }) => scope.organization === user?.organizationId,
});
const notices = createTopic({
  name: "notices",
  data: z.object({ text: z.string() }),
  canReceive: ({ user }) => user !== undefined,
});
const topics = createTopics([ordersUpdated, notices]);
type Topics = InferTopics<typeof topics>;

const tokenFor = (userId: string, organizationId: string) =>
  sign(
    { userId, organizationId, exp: Math.floor(Date.now() / 1000) + 3600 },
    SECRET
  );

describe("Socket.IO topics", () => {
  it("verifies connections with the server JWT, checks topic permissions, targets users and reports connection events", async () => {
    const connected: string[] = [];
    const disconnected: string[] = [];
    const app = await createNileServer({
      serverName: "socket-test",
      runtime: "node",
      forceNewInstance: true,
      logServices: false,
      auth: { secret: SECRET },
      rest: {
        baseUrl: "/api",
        allowedOrigins: [],
        enableStatus: true,
        discovery: { enabled: true },
      },
      socket: {
        topics,
        onConnect: ({ user }) => {
          connected.push(user?.userId ?? "anonymous");
        },
        onDisconnect: ({ user }) => {
          disconnected.push(user?.userId ?? "anonymous");
        },
      },
      services: [
        {
          name: "orders",
          description: "Orders",
          actions: [
            createAction<{ userId: string; text: string }>({
              name: "notify",
              description: "Notify one user",
              validation: z.object({ userId: z.string(), text: z.string() }),
              handler: async (data) => {
                const { socket } = getContext({ topics });
                const sent = await socket.send({
                  topic: "notices",
                  to: { userId: data.userId },
                  data: { text: data.text },
                });
                return sent.isOk ? Ok({ sent: true }) : sent;
              },
            }),
          ],
        },
      ],
    });
    if (!(app.rest && app.socket)) {
      throw new Error("Missing fixture interfaces");
    }
    const rest = app.rest;
    const listener = createServer(
      getRequestListener((request) => rest.app.fetch(request))
    );
    await app.socket.attachNode(listener);
    await new Promise<void>((resolve) =>
      listener.listen(0, "127.0.0.1", resolve)
    );
    const address = listener.address();
    if (!address || typeof address === "string") {
      throw new Error("Missing address");
    }
    const origin = `http://127.0.0.1:${address.port}`;
    const clientFor = (token?: string) =>
      createNileClient<Record<string, Record<string, unknown>>, Topics>({
        // A path in baseUrl must not become a Socket.IO namespace.
        baseUrl: `${origin}/api`,
        socket: { timeout: 2000, auth: token ? { token } : {} },
      });
    let clientConnected = 0;
    const ada = createNileClient<
      Record<string, Record<string, unknown>>,
      Topics
    >({
      baseUrl: `${origin}/api`,
      socket: {
        timeout: 2000,
        auth: { token: await tokenFor("ada", "one") },
        onConnect: () => {
          clientConnected++;
        },
      },
    });
    const grace = clientFor(await tokenFor("grace", "two"));
    const anonymous = clientFor();
    const forged = clientFor("not-a-jwt");

    const adaOrders: unknown[] = [];
    const graceOrders: number[] = [];
    const adaNotices: string[] = [];
    const graceNotices: string[] = [];
    const serverSaw: Message[] = [];
    const checked = await safeTry(async () => {
      const unsubscribeServer = await app.socket.receive({
        topic: "orders.updated",
        onMessage: (message) => {
          serverSaw.push(message);
        },
      });
      expect(unsubscribeServer.isOk).toBe(true);

      const subscribed = await ada.socket.receive({
        topic: "orders.updated",
        scope: { organization: "one" },
        onMessage: ({ data }) => {
          adaOrders.push(data);
        },
      });
      expect(subscribed.isOk).toBe(true);
      expect(clientConnected).toBe(1);
      expect(
        (
          await grace.socket.receive({
            topic: "orders.updated",
            scope: { organization: "two" },
            onMessage: ({ data }) => {
              graceOrders.push(data.value);
            },
          })
        ).isOk
      ).toBe(true);
      // canReceive refuses another organization's scope.
      expect(
        (
          await grace.socket.receive({
            topic: "orders.updated",
            scope: { organization: "one" },
            onMessage: () => undefined,
          })
        ).error
      ).toBe("Topic access denied");
      // Unknown topics fail with a Result, not a throw.
      const unknown = await ada.socket.receive({
        // @ts-expect-error The topic is not in the contract.
        topic: "missing",
        onMessage: () => undefined,
      });
      expect(unknown.error).toBe("Unknown topic");
      // Anonymous connections are allowed, but these topics need a user.
      expect(
        (
          await anonymous.socket.receive({
            topic: "notices",
            onMessage: () => undefined,
          })
        ).error
      ).toBe("Topic access denied");
      // A token that is present but invalid refuses the connection.
      expect(
        (
          await forged.socket.receive({
            topic: "notices",
            onMessage: () => undefined,
          })
        ).isErr
      ).toBe(true);

      for (const [client, sink] of [
        [ada, adaNotices],
        [grace, graceNotices],
      ] as const) {
        expect(
          (
            await client.socket.receive({
              topic: "notices",
              onMessage: ({ data }) => {
                sink.push(data.text);
              },
            })
          ).isOk
        ).toBe(true);
      }

      // Schema validation and canSend both run on client sends.
      expect(
        (
          await ada.socket.send({
            topic: "orders.updated",
            scope: { organization: "one" },
            data: { id: "a", value: -1 },
          })
        ).error
      ).toBe("Invalid topic data");
      expect(
        (
          await grace.socket.send({
            topic: "orders.updated",
            scope: { organization: "one" },
            data: { id: "a", value: 1 },
          })
        ).error
      ).toBe("Topic access denied");
      // Without canSend, clients cannot send to a topic.
      expect(
        (await ada.socket.send({ topic: "notices", data: { text: "hi" } }))
          .error
      ).toBe("Topic access is not permitted");

      const sent = await ada.socket.send({
        topic: "orders.updated",
        scope: { organization: "one" },
        data: {
          id: "a",
          value: 7,
          raw: "PRIVATE_RAW",
          nested: { raw: "PRIVATE_RAW", keep: 1 },
        },
      });
      expect(sent.isOk).toBe(true);
      expect(sent.value?.from?.userId).toBe("ada");
      await expect.poll(() => adaOrders.length).toBe(1);
      expect(adaOrders).toEqual([{ id: "a", value: 7, nested: { keep: 1 } }]);
      expect(graceOrders).toEqual([]);
      expect(serverSaw).toHaveLength(1);
      expect(serverSaw[0]?.from?.userId).toBe("ada");

      // An action sends to one user's connections only.
      const notified = await app.invoke({
        service: "orders",
        action: "notify",
        payload: { userId: "grace", text: "for grace" },
      });
      expect(notified.isOk).toBe(true);
      await expect.poll(() => graceNotices).toEqual(["for grace"]);
      expect(adaNotices).toEqual([]);

      await subscribed.value?.unsubscribe();
      await app.socket.send({
        topic: "orders.updated",
        scope: { organization: "one" },
        data: { id: "a", value: 8 },
      });
      expect(adaOrders).toHaveLength(1);

      expect(connected.sort()).toEqual(["ada", "anonymous", "grace"]);

      const schema = await app.schema();
      expect(schema.isOk).toBe(true);
      const discovered = await fetch(`${origin}/api/services`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          intent: "schema",
          service: "*",
          action: "*",
          payload: { kind: "topics" },
        }),
      });
      const exported = (await discovered.json()) as {
        data: Record<string, object>;
      };
      expect(exported.data["orders.updated"]).toBeDefined();
    });
    for (const client of [ada, grace, anonymous, forged]) {
      client.socket.close();
    }
    await expect.poll(() => disconnected.length).toBe(3);
    await app.lifecycle.shutdown();
    expect(listener.listening).toBe(true);
    await new Promise<void>((resolve) => listener.close(() => resolve()));
    expect(app.socket.connections()).toBe(0);
    if (checked.isErr) {
      throw new Error(String(checked.error));
    }
  }, 15_000);
});
