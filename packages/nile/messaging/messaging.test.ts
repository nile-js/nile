import { describe, expect, expectTypeOf, it } from "vitest";
import z from "zod";
import type { createNileSocket } from "../../client/src/socket-client";
import type { NileSocketClient } from "../../client/src/socket-types";
import { createTopicMessaging } from "./messaging";
import { createTopic, createTopics } from "./topics";
import type { InferTopics } from "./types";

const countChanged = createTopic({
  name: "count.changed",
  data: z.object({ count: z.string().transform(Number) }),
  scope: z.object({ organization: z.string() }),
  canReceive: ({ scope, user }) => {
    expectTypeOf(scope).toEqualTypeOf<{ organization: string }>();
    return scope.organization === user?.organizationId;
  },
  canSend: ({ data }) => {
    expectTypeOf(data).toEqualTypeOf<{ count: number }>();
    return data.count >= 0;
  },
});
const alerts = createTopic({
  name: "alerts",
  data: z.object({ text: z.string() }),
});
const topics = createTopics([countChanged, alerts]);
const DUPLICATE_TOPIC = /more than once/;

describe("topic contracts", () => {
  it("keys topics by name, types scopes and keeps client contracts aligned", () => {
    expect(Object.keys(topics)).toEqual(["count.changed", "alerts"]);
    expect(() => createTopics([alerts, alerts])).toThrow(DUPLICATE_TOPIC);
    interface FrontendTopics {
      "count.changed": {
        input: { count: string };
        data: { count: number };
        scope: { organization: string };
      };
    }
    const check = (socket: NileSocketClient<FrontendTopics>) => {
      socket.send({
        topic: "count.changed",
        scope: { organization: "one" },
        data: { count: "2" },
      });
      // @ts-expect-error Topic names must be registered in the supplied contract.
      socket.send({ topic: "missing", data: {} });
      socket.send({
        topic: "count.changed",
        scope: { organization: "one" },
        // @ts-expect-error Publisher input differs from subscriber output.
        data: { count: 2 },
      });
      // @ts-expect-error Scoped topic requires its scope.
      socket.send({ topic: "count.changed", data: { count: "2" } });
    };
    expectTypeOf(check)
      .parameter(0)
      .toMatchTypeOf<
        ReturnType<
          typeof createNileSocket<
            Pick<InferTopics<typeof topics>, "count.changed">
          >
        >
      >();
    expectTypeOf<
      InferTopics<typeof topics>["count.changed"]["data"]
    >().toEqualTypeOf<{ count: number }>();
    expectTypeOf<InferTopics<typeof topics>["alerts"]["scope"]>().toBeNever();
  });

  it("parses once per publication, scopes fanout, contains failures and isolates instances", async () => {
    const first = createTopicMessaging(topics);
    const second = createTopicMessaging(topics);
    const delivered: number[] = [];
    const other: number[] = [];
    const subscription = await first.api.receive({
      topic: "count.changed",
      scope: { organization: "one" },
      onMessage: ({ data }) => {
        delivered.push(data.count);
      },
    });
    await first.api.receive({
      topic: "count.changed",
      scope: { organization: "two" },
      onMessage: ({ data }) => {
        other.push(data.count);
      },
    });
    await first.api.receive({
      topic: "count.changed",
      scope: { organization: "one" },
      onMessage: () => {
        throw new Error("Listener failure");
      },
    });
    expect(
      (
        await second.api.send({
          topic: "count.changed",
          scope: { organization: "one" },
          data: { count: "1" },
        })
      ).isOk
    ).toBe(true);
    expect(delivered).toEqual([]);
    expect(
      (
        await first.api.send({
          topic: "count.changed",
          scope: { organization: "one" },
          data: { count: "2" },
        })
      ).isOk
    ).toBe(true);
    expect(delivered).toEqual([2]);
    expect(other).toEqual([]);
    expect(
      (
        await first.send({
          topic: "count.changed",
          scope: { organization: 2 },
          data: { count: "3" },
        })
      ).isErr
    ).toBe(true);
    expect((await first.send({ topic: "missing", data: {} })).isErr).toBe(true);
    if (subscription.isOk) {
      subscription.value.unsubscribe();
    }
    first.close();
    second.close();
    expect(
      (
        await first.api.send({
          topic: "count.changed",
          scope: { organization: "one" },
          data: { count: "4" },
        })
      ).isErr
    ).toBe(true);
    expect(delivered).toEqual([2]);
  });

  it("lets the server receive every scope and targets users or connections", async () => {
    const messaging = createTopicMessaging(topics);
    const everywhere: unknown[] = [];
    const ada: string[] = [];
    const adaPhone: string[] = [];
    const grace: string[] = [];
    await messaging.api.receive({
      topic: "count.changed",
      onMessage: ({ scope }) => {
        everywhere.push(scope);
      },
    });
    // A client subscription must always name its scope.
    expect(
      (
        await messaging.receive({
          topic: "count.changed",
          onMessage: () => undefined,
        })
      ).isErr
    ).toBe(true);
    const listen = (sink: string[], connectionId: string, userId: string) =>
      messaging.receive(
        {
          topic: "alerts",
          onMessage: ({ data }) => {
            sink.push((data as { text: string }).text);
          },
        },
        { connectionId, userId }
      );
    await listen(ada, "c1", "ada");
    await listen(adaPhone, "c2", "ada");
    await listen(grace, "c3", "grace");

    await messaging.api.send({
      topic: "count.changed",
      scope: { organization: "one" },
      data: { count: "1" },
    });
    await messaging.api.send({
      topic: "count.changed",
      scope: { organization: "two" },
      data: { count: "2" },
    });
    expect(everywhere).toEqual([
      { organization: "one" },
      { organization: "two" },
    ]);

    await messaging.api.send({
      topic: "alerts",
      to: { userId: "ada" },
      data: { text: "user" },
    });
    await messaging.api.send({
      topic: "alerts",
      to: { connectionId: "c3" },
      data: { text: "one" },
    });
    await messaging.api.send({ topic: "alerts", data: { text: "all" } });
    expect(ada).toEqual(["user", "all"]);
    expect(adaPhone).toEqual(["user", "all"]);
    expect(grace).toEqual(["one", "all"]);
    expect(
      (
        await messaging.api.send({
          topic: "alerts",
          // @ts-expect-error A target names a user or a connection.
          to: { room: "x" },
          data: { text: "bad" },
        })
      ).isErr
    ).toBe(true);
    messaging.close();
  });
});
