import { Ok } from "slang-ts";
import { describe, expect, it } from "vitest";
import { createNileServer } from "../../nile/server";

/** Build one server per adapter and send execute envelopes through its real HTTP entry point. */
async function createSender(native: boolean) {
  let server: Awaited<ReturnType<typeof createNileServer>>;
  server = await createNileServer({
    runtime: "bun",
    native,
    serverName: "Success messages",
    forceNewInstance: true,
    logServices: false,
    diagnostics: false,
    rest: {
      baseUrl: "/api",
      allowedOrigins: [],
      cors: { enabled: false },
    },
    services: [
      {
        name: "projects",
        description: "Projects",
        actions: [
          {
            name: "plain",
            description: "No message configured",
            handler: () => Ok({ id: 1 }),
          },
          {
            name: "configured",
            description: "Per-action message",
            successMessage: "Project created",
            handler: () => Ok({ id: 1 }),
          },
          {
            name: "fromResult",
            description: "Handler message wins",
            successMessage: "Project created",
            handler: () => Ok({ id: 1 }, "Project renamed"),
          },
          {
            name: "outer",
            description: "Calls an action that sets its own message",
            handler: async (_payload, context) => {
              if (!context) {
                throw new Error("Missing context");
              }
              const inner = await server.engine.executeAction(
                "projects",
                "fromResult",
                {},
                context
              );
              return inner.isErr ? inner : Ok({ nested: true });
            },
          },
        ],
      },
    ],
  });

  return async (action: string) => {
    const init = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        intent: "execute",
        service: "projects",
        action,
        payload: {},
      }),
    };
    const response = native
      ? await server.nativeRest?.fetch(
          new Request("http://localhost/api/services", init)
        )
      : await server.rest?.app.request("/api/services", init);
    if (!response) {
      throw new Error("REST transport not initialized");
    }
    return (await response.json()) as { status: boolean; message: string };
  };
}

describe.each([
  { adapter: "native", native: true },
  { adapter: "Hono", native: false },
])("success messages through the $adapter adapter", ({ native }) => {
  it("keeps the default message when nothing is configured", async () => {
    const send = await createSender(native);
    expect(await send("plain")).toMatchObject({
      status: true,
      message: "Action 'projects.plain' executed",
    });
  });

  it("uses the action's successMessage", async () => {
    const send = await createSender(native);
    expect((await send("configured")).message).toBe("Project created");
  });

  it("prefers the message the handler returns with Ok", async () => {
    const send = await createSender(native);
    expect((await send("fromResult")).message).toBe("Project renamed");
  });

  it("does not leak a nested action's message into the outer response", async () => {
    const send = await createSender(native);
    expect((await send("outer")).message).toBe(
      "Action 'projects.outer' executed"
    );
  });
});
