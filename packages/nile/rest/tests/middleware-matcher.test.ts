import { HTTPException } from "hono/http-exception";
import { Ok } from "slang-ts";
import { describe, expect, it } from "vitest";
import { createEngine } from "../../engine/engine";
import { createNileContext } from "../../nile/nile";
import { createMiddlewareMatcher } from "../middleware-matcher";
import { createRestApp } from "../rest";
import type { MiddlewareEntry } from "../types";

/** Build an in-process fixture without listening sockets or external resources. */
function createFixture() {
  let calls = 0;
  const rest = createRestApp({
    config: { baseUrl: "/api", allowedOrigins: [] },
    engine: createEngine({
      services: [
        {
          name: "items",
          description: "Items",
          actions: [
            {
              name: "read",
              description: "Read",
              handler: () => {
                calls += 1;
                return Ok("done");
              },
            },
          ],
        },
      ],
    }),
    nileContext: createNileContext(),
    serverName: "matcher-test",
    runtime: "bun",
  });
  const request = () =>
    rest.app.request("/api/services", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        intent: "execute",
        service: "items",
        action: "read",
        payload: {},
      }),
    });
  return { ...rest, request, calls: () => calls };
}

describe("Middleware selection", () => {
  it("caches only the canonical path and invalidates after registration", () => {
    const entries: MiddlewareEntry[] = [
      { path: "/api", fn: async () => undefined },
    ];
    let reads = 0;
    const matcher = createMiddlewareMatcher({
      servicesPath: "/api/services",
      readRegistry: () => {
        reads += 1;
        return entries;
      },
    });
    const first = matcher.match("/api/services");
    expect(matcher.match("/api/services")).toBe(first);
    expect(reads).toBe(1);
    Array.from({ length: 1000 }, (_, index) =>
      matcher.match(`/api2/custom-${index}`)
    );
    expect(reads).toBe(1001);
    expect(matcher.match("/api/services")).toBe(first);
    entries.push({ path: "/", fn: async () => undefined });
    matcher.invalidate();
    expect(matcher.match("/api/services")).toHaveLength(2);
    expect(first).toHaveLength(1);
    expect(reads).toBe(1002);
  });

  it("keeps prefix matching and registration order on custom paths", async () => {
    const fixture = createFixture();
    const seen: string[] = [];
    fixture.addMiddleware("/api", async (_context, next) => {
      seen.push("api");
      await next();
    });
    fixture.addMiddleware("/api2", async (_context, next) => {
      seen.push("api2");
      await next();
    });
    fixture.addMiddleware("/elsewhere", async (_context, next) => {
      seen.push("wrong");
      await next();
    });
    fixture.app.get("/api2/custom", (context) => context.text("custom"));
    await fixture.request();
    expect(seen).toEqual(["api"]);
    seen.length = 0;
    const response = await fixture.app.request("/api2/custom");
    expect(await response.text()).toBe("custom");
    expect(seen).toEqual(["api", "api2"]);
  });

  it("runs late additions on the next request and preserves current matching snapshot", async () => {
    const fixture = createFixture();
    const seen: string[] = [];
    await fixture.request();
    let added = false;
    fixture.addMiddleware("/api", async (_context, next) => {
      seen.push("first");
      if (!added) {
        added = true;
        fixture.addMiddleware("/api", async (_inner, innerNext) => {
          seen.push("late");
          await innerNext();
        });
      }
      await next();
    });
    await fixture.request();
    expect(seen).toEqual(["first"]);
    seen.length = 0;
    await fixture.request();
    expect(seen).toEqual(["first", "late"]);
    expect(fixture.calls()).toBe(3);
  });

  it("preserves onion order, headers, and one downstream invocation", async () => {
    const fixture = createFixture();
    const seen: string[] = [];
    fixture.addMiddleware("/api", async (context, next) => {
      seen.push("before-one");
      await next();
      context.header("x-first", "yes");
      seen.push("after-one");
    });
    fixture.addMiddleware("/api/services", async (_context, next) => {
      seen.push("before-two");
      await next();
      seen.push("after-two");
    });
    const response = await fixture.request();
    expect(response.status).toBe(200);
    expect(response.headers.get("x-first")).toBe("yes");
    expect(seen).toEqual([
      "before-one",
      "before-two",
      "after-two",
      "after-one",
    ]);
    expect(fixture.calls()).toBe(1);
  });

  it("passes empty and nonmatching selections directly downstream", async () => {
    const fixture = createFixture();
    expect((await fixture.request()).status).toBe(200);
    fixture.addMiddleware("/unrelated", () => {
      throw new Error("Must not run");
    });
    expect((await fixture.request()).status).toBe(200);
    expect((await fixture.request()).status).toBe(200);
    expect(fixture.calls()).toBe(3);
  });

  it("preserves HTTPException short circuits and the registration cap", async () => {
    const fixture = createFixture();
    fixture.addMiddleware("/api", () => {
      throw new HTTPException(403, { message: "Blocked" });
    });
    Array.from({ length: 49 }, () =>
      fixture.addMiddleware("/api", async (_context, next) => {
        await next();
      })
    );
    expect(() => fixture.addMiddleware("/api", async () => undefined)).toThrow(
      "Maximum middleware limit (50)"
    );
    expect((await fixture.request()).status).toBe(403);
    expect(fixture.calls()).toBe(0);
  });

  it("preserves middleware error handling without calling the action", async () => {
    const fixture = createFixture();
    fixture.addMiddleware("/api", () => {
      throw new Error("Private failure");
    });
    const response = await fixture.request();
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      message: "Internal server error",
    });
    expect(fixture.calls()).toBe(0);
  });
});
