import type { Context } from "hono";
import { Ok } from "slang-ts";
import { describe, expect, it } from "vitest";
import { createNileServer } from "../../nile/server";
import type { ServerConfig } from "../../nile/types";

/** Shared configuration keeps selection checks independent of action setup. */
function createConfig() {
  return {
    serverName: "Adapter selection",
    forceNewInstance: true,
    logServices: false,
    services: [
      {
        name: "test",
        description: "Test service",
        actions: [
          {
            name: "main",
            description: "Test action",
            handler: () => Ok({ selected: true }),
          },
        ],
      },
    ],
    rest: { baseUrl: "/api", allowedOrigins: [], enableStatus: true },
  };
}

describe("backward-compatible adapter selection", () => {
  it.each([
    {},
    { runtime: "bun" as const },
    { runtime: "node" as const },
    { runtime: "bun" as const, native: false as const },
  ])("keeps Hono APIs for existing configuration %j", async (selection) => {
    const config: ServerConfig = {
      ...createConfig(),
      ...selection,
      rest: {
        ...createConfig().rest,
        cors: {
          defaults: {
            origin: (_origin, context: Context) => context.req.header("origin"),
          },
        },
      },
    };
    const server = await createNileServer(config);
    expect(server.nativeRest).toBeUndefined();
    expect(server.rest).toBeDefined();
    server.rest?.app.get("/legacy", (context) => context.text("Hono route"));
    const response = await server.rest?.app.request("/legacy", {
      headers: { origin: "https://client.example" },
    });
    expect(await response?.text()).toBe("Hono route");
    expect(response?.headers.get("access-control-allow-origin")).toBe(
      "https://client.example"
    );
  });

  it("selects Bun native through the runtime flag and shared rest settings", async () => {
    const server = await createNileServer({
      ...createConfig(),
      runtime: "bun",
      native: true,
      rest: {
        ...createConfig().rest,
        cors: {
          defaults: {
            origin: (_origin, context) => context.request.headers.get("origin"),
          },
        },
      },
    });
    expect(server.rest).toBeUndefined();
    expect(server.nativeRest).toBeDefined();
    const response = await server.nativeRest?.fetch(
      new Request("http://localhost/api/services", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://client.example",
        },
        body: JSON.stringify({
          intent: "execute",
          service: "test",
          action: "main",
          payload: {},
        }),
      })
    );
    expect(response?.status).toBe(200);
    expect(response?.headers.get("access-control-allow-origin")).toBe(
      "https://client.example"
    );
    expect(await response?.json()).toMatchObject({
      status: true,
      data: { selected: true },
    });
  });

  it("requires an explicit Bun runtime for JavaScript callers too", async () => {
    await expect(
      // @ts-expect-error An omitted runtime cannot select Bun native.
      createNileServer({ ...createConfig(), native: true })
    ).rejects.toThrow('requires runtime: "bun"');
  });
});
