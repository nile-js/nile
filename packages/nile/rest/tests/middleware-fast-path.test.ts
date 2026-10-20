import { HTTPException } from "hono/http-exception";
import { describe, expect, it } from "vitest";
import { createEngine } from "../../engine/engine";
import { createNileContext } from "../../nile/nile";
import { createRestApp } from "../rest";

/** Keep custom routes and late middleware observable without opening a server. */
function createFixture() {
  const rest = createRestApp({
    config: {
      baseUrl: "/api",
      allowedOrigins: [],
      cors: { enabled: false },
      enableStatus: true,
    },
    engine: createEngine({ services: [] }),
    nileContext: createNileContext(),
    serverName: "middleware-test",
    runtime: "bun",
  });
  rest.app.get("/custom", (context) => context.text("custom"));
  return rest;
}

describe("Global middleware fast path", () => {
  it("applies late registrations to custom routes, status and not-found responses", async () => {
    const rest = createFixture();
    expect((await rest.app.request("/custom")).status).toBe(200);
    const seen: string[] = [];
    rest.addMiddleware("/", async (context, next) => {
      seen.push(`before:${context.req.path}`);
      await next();
      context.header("x-middleware", "late");
      seen.push(`after:${context.req.path}`);
    });

    for (const [path, status] of [
      ["/custom", 200],
      ["/status", 200],
      ["/missing", 404],
    ] as const) {
      const response = await rest.app.request(path);
      expect(response.status).toBe(status);
      expect(response.headers.get("x-middleware")).toBe("late");
    }
    expect(seen).toEqual([
      "before:/custom",
      "after:/custom",
      "before:/status",
      "after:/status",
      "before:/missing",
      "after:/missing",
    ]);
  });

  it("retains prefix filtering and late error handling on custom routes", async () => {
    const rest = createFixture();
    expect(await (await rest.app.request("/custom")).text()).toBe("custom");
    rest.addMiddleware("/custom", () => {
      throw new HTTPException(403, { message: "Custom blocked" });
    });
    const response = await rest.app.request("/custom");
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      message: "Custom blocked",
      status: false,
    });
    expect((await rest.app.request("/status")).status).toBe(200);
    expect((await rest.app.request("/missing")).status).toBe(404);
  });
});
