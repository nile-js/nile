import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import { Ok } from "slang-ts";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createRateLimiter } from "../../controls/rate-limit";
import { createAction } from "../../engine/create-action";
import { createNileTelemetry } from "../../telemetry/create-telemetry";
import { createNileServer, getContext } from "../server";
import type { ExternalResponse, NileContext } from "../types";

function requireContext(context?: NileContext): NileContext {
  if (!context) {
    throw new Error("Fixture requires context");
  }
  return context;
}

const services = [
  {
    name: "orders",
    description: "Orders",
    actions: [
      createAction<{ name: string }>({
        name: "create",
        description: "Create",
        validation: z.object({ name: z.string() }),
        handler: async (data, context) => {
          await Promise.resolve();
          const scope = requireContext(context);
          return Ok({
            name: data.name,
            requestId: scope.execution?.requestId,
            transport: scope.execution?.transport,
            session: scope.getSession("rest")?.user,
            resource: getContext().resources?.label,
          });
        },
      }),
    ],
  },
];

describe("Nile v1 integrated execution", () => {
  it.each([true, false])(
    "shares validation, correlation and quotas across RPC/HTTP (native=%s)",
    async (native) => {
      const limiter = createRateLimiter({
        strategy: "fixed-window",
        limit: 1,
        windowMs: 60_000,
      });
      const server = await createNileServer({
        serverName: "v1",
        services,
        runtime: "bun",
        native,
        forceNewInstance: true,
        logServices: false,
        execution: { rateLimit: { store: limiter, key: () => "shared" } },
        rest: { baseUrl: "/api", allowedOrigins: [], enableStatus: true },
      });
      const direct = await server.invoke({
        service: "orders",
        action: "create",
        payload: { name: "one" },
        requestId: "direct-1",
      });
      expect(direct.isOk).toBe(true);
      const response = await server.fetch(
        new Request("http://localhost/api/services", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-request-id": "http-1",
          },
          body: JSON.stringify({
            intent: "execute",
            service: "orders",
            action: "create",
            payload: { name: "two" },
          }),
        })
      );
      expect(response?.headers.get("x-request-id")).toBe("http-1");
      if (!response) {
        throw new Error("HTTP response missing");
      }
      const envelope = (await response.json()) as ExternalResponse;
      expect(envelope.status).toBe(false);
      limiter.reset();
      const invalid = await server.invoke({
        service: "orders",
        action: "create",
        payload: { name: 5 },
      });
      expect(invalid.isErr ? invalid.error : "Unexpected success").toContain(
        "Validation failed"
      );
      await server.lifecycle.shutdown();
      expect(
        (await server.fetch(new Request("http://localhost/ready")))?.status
      ).toBe(503);
      limiter.close?.();
    }
  );

  it("keeps concurrent direct sessions and instance resources isolated", async () => {
    const first = await createNileServer({
      serverName: "first",
      services,
      resources: { label: "first" },
      forceNewInstance: true,
      logServices: false,
    });
    const second = await createNileServer({
      serverName: "second",
      services,
      resources: { label: "second" },
      forceNewInstance: true,
      logServices: false,
    });
    const results = await Promise.all([
      first.invoke({
        service: "orders",
        action: "create",
        payload: { name: "a" },
        session: { user: "a" },
      }),
      second.invoke({
        service: "orders",
        action: "create",
        payload: { name: "b" },
        session: { user: "b" },
      }),
    ]);
    expect(results.map((result) => result.expect())).toEqual([
      expect.objectContaining({
        name: "a",
        session: "a",
        resource: "first",
        transport: "rpc",
      }),
      expect.objectContaining({
        name: "b",
        session: "b",
        resource: "second",
        transport: "rpc",
      }),
    ]);
    await Promise.all([
      first.lifecycle.shutdown(),
      second.lifecycle.shutdown(),
    ]);
  });

  it("drains accepted work and runs cleanup once", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let cleanup = 0;
    const server = await createNileServer({
      serverName: "drain",
      forceNewInstance: true,
      logServices: false,
      services: [
        {
          name: "work",
          description: "Work",
          actions: [
            createAction({
              name: "wait",
              description: "Wait",
              handler: async () => {
                await gate;
                return Ok(null);
              },
            }),
          ],
        },
      ],
      cleanup: [
        {
          name: "resource",
          close: () => {
            cleanup++;
          },
        },
      ],
    });
    const work = server.invoke({
      service: "work",
      action: "wait",
      payload: {},
    });
    const stopped = server.lifecycle.shutdown();
    expect(server.lifecycle.isReady()).toBe(false);
    expect(
      (await server.invoke({ service: "work", action: "wait", payload: {} }))
        .isErr
    ).toBe(true);
    release();
    expect((await work).isOk).toBe(true);
    expect((await stopped).timedOut).toBe(false);
    await server.lifecycle.shutdown();
    expect(cleanup).toBe(1);
  });

  it("exports real action spans without payloads or credentials", async () => {
    const exporter = new InMemorySpanExporter();
    const telemetry = createNileTelemetry({
      serviceName: "test",
      traceExporter: exporter,
      metrics: false,
    });
    const server = await createNileServer({
      serverName: "tracing",
      services,
      forceNewInstance: true,
      logServices: false,
      execution: { diagnostics: { telemetry } },
    });
    expect(
      (
        await server.invoke({
          service: "orders",
          action: "create",
          payload: { name: "private-input" },
          requestId: "trace-request",
        })
      ).isOk
    ).toBe(true);
    await telemetry.flush();
    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.name).toBe("orders.create");
    expect(spans[0]?.attributes["nile.request.id"]).toBe("trace-request");
    expect(JSON.stringify(spans[0]?.attributes)).not.toContain("private-input");
    await server.lifecycle.shutdown();
  });
});
