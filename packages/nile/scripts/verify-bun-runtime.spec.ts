import { test } from "bun:test";
import assert from "node:assert/strict";
import {
  AggregationTemporality,
  InMemoryMetricExporter,
} from "@opentelemetry/sdk-metrics";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import { serve } from "bun";
import { Ok, safeTry } from "slang-ts";
import z from "zod";
import { createNileClient } from "../../client/src/create-client";
import { createAction } from "../engine/create-action";
import { createTopic, createTopics } from "../messaging/topics";
import { createNileServer } from "../nile/server";
import { createNileTelemetry } from "../telemetry/create-telemetry";

test("Bun-native HTTP, socket topics and telemetry integration", async () => {
  /** Real Bun-native HTTP/socket/export check; no application database or fixed port. */
  const exporter = new InMemorySpanExporter();
  const metricExporter = new InMemoryMetricExporter(
    AggregationTemporality.CUMULATIVE
  );
  const telemetry = createNileTelemetry({
    serviceName: "bun-smoke",
    traceExporter: exporter,
    metrics: true,
    metricExporter,
  });
  const app = await createNileServer({
    serverName: "Bun smoke",
    runtime: "bun",
    native: true,
    forceNewInstance: true,
    logServices: false,
    rest: { baseUrl: "/api", allowedOrigins: [], enableStatus: true },
    socket: {
      topics: createTopics([
        createTopic({
          name: "ping",
          data: z.object({ n: z.number() }),
          canReceive: () => true,
          canSend: () => true,
        }),
      ]),
    },
    onBeforeActionHandler: () => Ok(null),
    execution: { diagnostics: { telemetry, hookTracing: true } },
    services: [
      {
        name: "work",
        description: "Work",
        actions: [
          createAction({
            name: "run",
            description: "Run",
            handler: (_data, context) =>
              Ok({ transport: context?.execution?.transport }),
          }),
        ],
      },
    ],
  });
  if (!app.socket?.bun) {
    throw new Error("Socket adapter missing");
  }
  const listener = serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: app.fetch,
    ...app.socket.bun,
  });
  const { socket } = createNileClient({
    baseUrl: `http://127.0.0.1:${listener.port}/api`,
  });
  const outcome = await safeTry(async () => {
    const response = await fetch(
      `http://127.0.0.1:${listener.port}/api/services`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          traceparent:
            "00-11111111111111111111111111111111-2222222222222222-01",
        },
        body: JSON.stringify({
          intent: "execute",
          service: "work",
          action: "run",
          payload: {},
        }),
      }
    );
    assert.equal(response.status, 200);
    const envelope = (await response.json()) as { data: { transport: string } };
    assert.equal(envelope.data.transport, "rest");
    const pinged = new Promise<number>((resolve) => {
      socket
        .receive({
          topic: "ping",
          onMessage: ({ data }) => resolve((data as { n: number }).n),
        })
        .then(async (received) => {
          assert.equal(received.error, null);
          assert.equal(
            (await socket.send({ topic: "ping", data: { n: 7 } })).error,
            null
          );
        });
    });
    assert.equal(await pinged, 7);
    await telemetry.flush();
    const spans = exporter.getFinishedSpans();
    assert.equal(spans.length, 2);
    const http = spans.find(
      (span) =>
        span.name === "work.run" && span.attributes["nile.transport"] === "rest"
    );
    assert.equal(
      http?.spanContext().traceId,
      "11111111111111111111111111111111"
    );
    assert.equal(http?.parentSpanContext?.spanId, "2222222222222222");
    assert.ok(spans.some((span) => span.name === "work.run:global.before"));
    const metricNames = metricExporter
      .getMetrics()
      .flatMap((resource) =>
        resource.scopeMetrics.flatMap((scope) =>
          scope.metrics.map((metric) => metric.descriptor.name)
        )
      );
    assert.ok(metricNames.includes("nile.action.executions"));
    assert.ok(metricNames.includes("nile.action.duration"));
    assert.ok(metricNames.includes("nile.action.active"));
  });
  socket.close();
  await app.lifecycle.shutdown();
  await listener.stop(true);
  if (outcome.isErr) {
    throw new Error(outcome.error);
  }
  console.log("Bun native HTTP, socket topics and OpenTelemetry smoke passed");
});
