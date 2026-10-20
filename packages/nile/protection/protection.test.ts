import { Ok } from "slang-ts";
import { describe, expect, it, vi } from "vitest";
import { createNileServer } from "../nile/server";
import { resolveClientAddress } from "./http";

describe("production protection", () => {
  it.each([true, false])(
    "bounds actual body bytes despite a false Content-Length (native=%s)",
    async (native) => {
      const handler = vi.fn(() => Ok(null));
      const server = await createNileServer({
        serverName: "protected",
        services: [
          {
            name: "s",
            description: "s",
            actions: [{ name: "a", description: "a", handler }],
          },
        ],
        runtime: "bun",
        native,
        forceNewInstance: true,
        logServices: false,
        rest: {
          baseUrl: "/api",
          allowedOrigins: [],
          protection: { maxBodyBytes: 20 },
        },
      });
      const response = await server.fetch(
        new Request("http://localhost/api/services", {
          method: "POST",
          headers: { "content-length": "1" },
          body: "a".repeat(30),
        })
      );
      expect(response?.status).toBe(413);
      expect(handler).not.toHaveBeenCalled();
      await server.lifecycle.shutdown();
    }
  );

  it("walks forwarded addresses only through explicitly trusted peers", () => {
    const request = new Request("http://localhost", {
      headers: { "x-forwarded-for": "forged, client, proxy" },
    });
    expect(
      resolveClientAddress(request, { getClientAddress: () => "peer" })
    ).toBe("peer");
    expect(
      resolveClientAddress(request, {
        getClientAddress: () => "peer",
        trustProxy: (address) => address === "peer" || address === "proxy",
      })
    ).toBe("client");
  });

  it("keeps timed-out work tracked until it actually settles", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const server = await createNileServer({
      serverName: "timeout",
      forceNewInstance: true,
      logServices: false,
      execution: { timeoutMs: 10 },
      services: [
        {
          name: "s",
          description: "s",
          actions: [
            {
              name: "a",
              description: "a",
              handler: async () => {
                await gate;
                return Ok(null);
              },
            },
          ],
        },
      ],
    });
    const result = await server.invoke({
      service: "s",
      action: "a",
      payload: {},
    });
    expect(result.isErr ? result.error : "Unexpected success").toContain(
      "timed out"
    );
    expect(server.lifecycle.active()).toBe(1);
    release();
    const report = await server.lifecycle.shutdown();
    expect(report.remainingExecutions).toBe(0);
    expect(report.timedOut).toBe(false);
  });
});
