import { Context, Hono } from "hono";
import { cors } from "hono/cors";
import { describe, expect, it, vi } from "vitest";
import { compileCorsPolicy, prepareCorsPolicy } from "../compile-policy";
import type { CorsOptions } from "../types";

/** Compare actual-response policies against the installed Hono middleware. */
const createApp = (options: CorsOptions, compiled: boolean) => {
  const app = new Hono();
  if (compiled) {
    const apply = compileCorsPolicy(options);
    app.use(async (context, next) => {
      apply(context);
      await next();
    });
  } else {
    app.use(cors(options));
  }
  app.post("/", (context) => context.json({ ok: true }, 201));
  return app;
};

describe("compileCorsPolicy", () => {
  const cases: { name: string; options: CorsOptions; origin?: string }[] = [
    { name: "default wildcard", options: {}, origin: "https://client.test" },
    { name: "wildcard without Origin", options: { origin: "*" } },
    {
      name: "matching string",
      options: { origin: "https://client.test" },
      origin: "https://client.test",
    },
    {
      name: "disallowed string",
      options: { origin: "https://client.test" },
      origin: "https://other.test",
    },
    {
      name: "missing Origin with string",
      options: { origin: "https://client.test" },
    },
    {
      name: "matching array",
      options: { origin: ["https://client.test", "https://other.test"] },
      origin: "https://client.test",
    },
    {
      name: "disallowed array",
      options: { origin: ["https://client.test"] },
      origin: "https://other.test",
    },
    {
      name: "empty array",
      options: { origin: [] },
      origin: "https://client.test",
    },
    {
      name: "credentials and exposure",
      options: {
        origin: "*",
        credentials: true,
        exposeHeaders: ["X-Trace", "X-Count"],
      },
      origin: "https://client.test",
    },
    {
      name: "denied origin retains credentials/exposure",
      options: { origin: "", credentials: true, exposeHeaders: ["X-Trace"] },
      origin: "https://client.test",
    },
  ];

  it.each(cases)("matches Hono actual-response headers: $name", async ({
    options,
    origin,
  }) => {
    const request: RequestInit = {
      method: "POST",
      headers: origin ? { Origin: origin } : {},
    };
    const expected = await createApp(options, false).request("/", request);
    const actual = await createApp(options, true).request("/", request);
    expect([...actual.headers]).toEqual([...expected.headers]);
    expect(actual.status).toBe(201);
    expect(await actual.json()).toEqual({ ok: true });
    expect(actual.headers.has("Access-Control-Allow-Methods")).toBe(false);
    expect(actual.headers.has("Access-Control-Max-Age")).toBe(false);
  });

  it("preserves existing Vary values when applied to a finished response", async () => {
    const app = new Hono();
    const apply = compileCorsPolicy({ origin: "https://client.test" });
    app.use(async (context, next) => {
      await next();
      apply(context);
    });
    app.get("/", (context) =>
      context.text("body", 202, { Vary: "Accept-Encoding" })
    );
    const response = await app.request("/", {
      headers: { Origin: "https://client.test" },
    });
    expect(response.headers.get("Vary")).toBe("Accept-Encoding, Origin");
    expect(response.status).toBe(202);
    expect(await response.text()).toBe("body");
  });

  it("evaluates dynamic origin callbacks for every request with its real context", async () => {
    const resolver = vi.fn((origin: string, context: Context) =>
      context.req.header("X-Allow") === "yes" ? origin : null
    );
    const app = createApp({ origin: resolver }, true);
    const allowed = await app.request("/", {
      method: "POST",
      headers: { Origin: "https://one.test", "X-Allow": "yes" },
    });
    const denied = await app.request("/", {
      method: "POST",
      headers: { Origin: "https://two.test" },
    });
    expect(allowed.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://one.test"
    );
    expect(denied.headers.has("Access-Control-Allow-Origin")).toBe(false);
    expect(resolver).toHaveBeenCalledTimes(2);
    expect(resolver.mock.calls.map(([origin]) => origin)).toEqual([
      "https://one.test",
      "https://two.test",
    ]);
    expect(denied.headers.get("Vary")).toBe("Origin");
  });

  it("joins static exposure once and does not create a placeholder response", () => {
    const exposeHeaders = ["X-First"];
    const context = new Context(new Request("http://localhost/"));
    const resGetter = vi.spyOn(context, "res", "get");
    const apply = compileCorsPolicy({ exposeHeaders });
    exposeHeaders.push("X-Later");
    apply(context);
    expect(resGetter).not.toHaveBeenCalled();
    const response = context.json({ ok: true });
    expect(response.headers.get("Access-Control-Expose-Headers")).toBe(
      "X-First"
    );
  });

  it("safely adds headers to an immutable response without changing its metadata", () => {
    const context = new Context(new Request("http://localhost/"));
    context.res = Response.redirect("https://target.test/", 307);
    compileCorsPolicy({ origin: "*", credentials: true })(context);
    expect(context.res.status).toBe(307);
    expect(context.res.headers.get("Location")).toBe("https://target.test/");
    expect(context.res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(context.res.headers.get("Access-Control-Allow-Credentials")).toBe(
      "true"
    );
  });
});

it("prepared apply avoids placeholder responses and leaves Vary until finish", () => {
  const context = new Context(
    new Request("http://localhost/", {
      headers: { Origin: "https://client.test" },
    })
  );
  const resGetter = vi.spyOn(context, "res", "get");
  const policy = prepareCorsPolicy({
    origin: "https://client.test",
    credentials: true,
    exposeHeaders: ["X-Trace"],
  });
  policy.apply(context);
  expect(resGetter).not.toHaveBeenCalled();
  const response = context.text("body");
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
    "https://client.test"
  );
  expect(response.headers.has("Vary")).toBe(false);
  context.res = response;
  policy.finish(context);
  expect(context.res.headers.get("Vary")).toBe("Origin");
});

it("prepared phases preserve handler CORS overrides and append to handler Vary", async () => {
  const app = new Hono();
  const policy = prepareCorsPolicy({
    origin: "https://client.test",
    credentials: true,
    exposeHeaders: ["X-Default"],
  });
  app.use(async (context, next) => {
    policy.apply(context);
    await next();
    policy.finish(context);
  });
  app.get("/", (context) => {
    context.header("Access-Control-Allow-Origin", "https://handler.test");
    context.header("Access-Control-Allow-Credentials", "false");
    context.header("Access-Control-Expose-Headers", "X-Handler");
    context.header("Vary", "Accept-Encoding");
    return context.text("body", 202);
  });
  const response = await app.request("/", {
    headers: { Origin: "https://client.test" },
  });
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
    "https://handler.test"
  );
  expect(response.headers.get("Access-Control-Allow-Credentials")).toBe(
    "false"
  );
  expect(response.headers.get("Access-Control-Expose-Headers")).toBe(
    "X-Handler"
  );
  expect(response.headers.get("Vary")).toBe("Accept-Encoding, Origin");
  expect(response.status).toBe(202);
  expect(await response.text()).toBe("body");
});
