import { createServer } from "node:http";
import { getRequestListener } from "@hono/node-server";
import { Ok, safeTry } from "slang-ts";
import { describe, expect, it } from "vitest";
import z from "zod";
import { createNileSocketClient } from "../../client/src/socket-client";
import { createAction } from "../engine/create-action";
import { createTopics } from "../messaging/topics";
import type { InferTopics } from "../messaging/types";
import { createNileServer } from "../nile/server";

const topics = createTopics({
  "orders.updated": {
    schema: z.object({ id: z.string(), value: z.number().nonnegative() }),
    scope: z.object({ organization: z.string() }),
  },
});
type Topics = InferTopics<typeof topics>;
interface Actions {
  orders: { echo: { value: number } };
}

describe("Socket.IO shared action and topic interface", () => {
  it("isolates concurrent actions, validates and authorizes scoped messages, and preserves its app-owned listener", async () => {
    const app = await createNileServer({
      serverName: "socket-test",
      runtime: "node",
      forceNewInstance: true,
      logServices: false,
      rest: {
        baseUrl: "/api",
        allowedOrigins: [],
        enableStatus: true,
        discovery: { enabled: true },
      },
      websocket: {
        topics,
        authenticate: (_request, auth) =>
          Ok({ session: { organization: auth.organization ?? "one" } }),
        authorizeSubscription: ({ scope, identity, context }) =>
          Ok(
            scope.organization === identity.session?.organization &&
              context.getSession("ws")?.organization ===
                identity.session?.organization
          ),
        authorizePublish: ({ scope, identity }) =>
          Ok(scope.organization === identity.session?.organization),
      },
      services: [
        {
          name: "orders",
          description: "Orders",
          actions: [
            createAction<{ value: number }>({
              name: "echo",
              description: "Echo",
              validation: z.object({ value: z.number() }),
              handler: async (data, context) => {
                if (!context) {
                  throw new Error("Context required");
                }
                context.updateHookState("value", data.value);
                await Promise.resolve();
                return Ok({
                  value: context.hookContext.state.value,
                  user: context.getSession("ws")?.organization,
                  transport: context.execution?.transport,
                });
              },
            }),
          ],
        },
      ],
    });
    if (!(app.rest && app.websocket)) {
      throw new Error("Missing fixture interfaces");
    }
    const rest = app.rest;
    const listener = createServer(
      getRequestListener((request) => rest.app.fetch(request))
    );
    await app.websocket.attachNode(listener);
    await new Promise<void>((resolve) =>
      listener.listen(0, "127.0.0.1", resolve)
    );
    const address = listener.address();
    if (!address || typeof address === "string") {
      throw new Error("Missing address");
    }
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const first = createNileSocketClient<Actions, Topics>({
      baseUrl,
      auth: { organization: "one" },
      timeout: 2000,
    });
    const second = createNileSocketClient<Actions, Topics>({
      baseUrl,
      auth: { organization: "two" },
      timeout: 2000,
    });
    const firstEvents: number[] = [];
    const secondEvents: number[] = [];
    const checked = await safeTry(async () => {
      const replies = await Promise.all(
        [1, 2].map((value) =>
          first.invoke({
            service: "orders",
            action: "echo",
            payload: { value },
          })
        )
      );
      // Socket replies use the client's Result shape; `data` stays as the legacy alias.
      expect(replies).toEqual(
        [1, 2].map((value) => ({
          isOk: true,
          isErr: false,
          value: { value, user: "one", transport: "ws" },
          error: null,
          data: { value, user: "one", transport: "ws" },
        }))
      );
      expect((await fetch(`${baseUrl}/status`)).status).toBe(200);
      const subscribed = await first.receive({
        topic: "orders.updated",
        scope: { organization: "one" },
        onMessage: ({ data }) => {
          firstEvents.push(data.value);
        },
      });
      expect(subscribed.error).toBeNull();
      expect(
        (
          await second.receive({
            topic: "orders.updated",
            scope: { organization: "two" },
            onMessage: ({ data }) => {
              secondEvents.push(data.value);
            },
          })
        ).error
      ).toBeNull();
      expect(
        (
          await second.receive({
            topic: "orders.updated",
            scope: { organization: "one" },
            onMessage: () => undefined,
          })
        ).error
      ).toBeTruthy();
      expect(
        (
          await first.send({
            topic: "orders.updated",
            scope: { organization: "one" },
            data: { id: "a", value: -1 },
          })
        ).error
      ).toBeTruthy();
      expect(
        (
          await second.send({
            topic: "orders.updated",
            scope: { organization: "one" },
            data: { id: "a", value: 1 },
          })
        ).error
      ).toBeTruthy();
      expect(
        (
          await first.send({
            topic: "orders.updated",
            scope: { organization: "one" },
            data: { id: "a", value: 7 },
          })
        ).error
      ).toBeNull();
      await expect.poll(() => firstEvents).toEqual([7]);
      expect(secondEvents).toEqual([]);
      await subscribed.data?.unsubscribe();
      const local = await app.websocket.send({
        topic: "orders.updated",
        scope: { organization: "one" },
        data: { id: "a", value: 8 },
      });
      expect(local.isOk).toBe(true);
      const schema = await app.schema();
      expect(schema.isOk).toBe(true);
      const discovered = await fetch(`${baseUrl}/api/services`, {
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
    first.close();
    second.close();
    await app.lifecycle.shutdown();
    expect(listener.listening).toBe(true);
    await new Promise<void>((resolve) => listener.close(() => resolve()));
    expect(app.websocket.connections()).toBe(0);
    if (checked.isErr) {
      throw new Error(String(checked.error));
    }
  }, 15_000);
});
