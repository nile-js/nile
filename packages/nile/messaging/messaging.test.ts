import { describe, expect, expectTypeOf, it } from "vitest";
import z from "zod";
import type { createNileSocketClient } from "../../client/src/socket-client";
import type { NileSocketClient } from "../../client/src/socket-types";
import { createTopicMessaging } from "./messaging";
import { createTopics } from "./topics";
import type { InferTopics } from "./types";

const topics = createTopics({
  "count.changed": {
    schema: z.object({ count: z.string().transform(Number) }),
    scope: z.object({ organization: z.string() }),
  },
});

describe("topic contracts", () => {
  it("preserves input/output inference in manually supplied client interfaces and inferred backend contracts", () => {
    interface Actions {
      counter: { update: { value: string } };
    }
    interface FrontendTopics {
      "count.changed": {
        input: { count: string };
        data: { count: number };
        scope: { organization: string };
      };
    }
    const check = (socket: NileSocketClient<Actions, FrontendTopics>) => {
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
      socket.invoke({
        service: "counter",
        action: "update",
        // @ts-expect-error Action payloads retain the supplied contract.
        payload: { value: 2 },
      });
    };
    expectTypeOf(check)
      .parameter(0)
      .toMatchTypeOf<
        ReturnType<
          typeof createNileSocketClient<Actions, InferTopics<typeof topics>>
        >
      >();
    expectTypeOf<
      InferTopics<typeof topics>["count.changed"]["data"]
    >().toEqualTypeOf<{ count: number }>();
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
});
