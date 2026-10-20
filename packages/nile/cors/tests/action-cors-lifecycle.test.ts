import type { Context } from "hono";
import { Ok } from "slang-ts";
import { describe, expect, it, vi } from "vitest";
import { createEngine } from "../../engine/engine";
import { createNileContext } from "../../nile/nile";
import { createRestApp } from "../../rest/rest";

describe("action CORS response lifecycle", () => {
  it("runs origin policy before the handler and preserves handler header overrides", async () => {
    const order: string[] = [];
    const origin = vi.fn(() => {
      order.push("cors");
      return "https://client.test";
    });
    const engine = createEngine({
      services: [
        {
          name: "test",
          description: "Test",
          actions: [
            {
              name: "read",
              description: "Read",
              handler: (_payload, context) => {
                if (!context) {
                  throw new Error("Fixture requires a Nile context");
                }
                order.push("handler");
                context
                  .get<Context>("rest")
                  ?.header("Access-Control-Expose-Headers", "X-Handler");
                context.get<Context>("rest")?.header("Vary", "Accept-Encoding");
                return Ok(null);
              },
            },
          ],
        },
      ],
    });
    const { app } = createRestApp({
      config: {
        baseUrl: "/api",
        allowedOrigins: [],
        cors: { defaults: { origin } },
      },
      engine,
      nileContext: createNileContext(),
      serverName: "Lifecycle",
      runtime: "bun",
    });
    const response = await app.request("/api/services", {
      method: "POST",
      headers: {
        origin: "https://client.test",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        intent: "execute",
        service: "test",
        action: "read",
        payload: {},
      }),
    });
    expect(response.status).toBe(200);
    expect(order).toEqual(["cors", "handler"]);
    expect(origin).toHaveBeenCalledTimes(1);
    expect(response.headers.get("Access-Control-Expose-Headers")).toBe(
      "X-Handler"
    );
    expect(response.headers.get("Vary")).toBe("Accept-Encoding, Origin");
  });
});
