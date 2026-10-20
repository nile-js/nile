import { Ok } from "slang-ts";
import { describe, expect, it, vi } from "vitest";
import type { Action, Service } from "@/engine/types";
import { createNativeRequestContext } from "../context";
import { createNativeCors } from "../cors";
import type { NativeRestConfig } from "../types";

const origin = "https://allowed.example";
const config: NativeRestConfig = { baseUrl: "/api", allowedOrigins: [origin] };
const action: Action = {
  name: "run",
  description: "test",
  handler: () => Ok({}),
};
const service: Service = {
  name: "test",
  description: "test",
  actions: [action],
};

/** Construct real native state so response headers follow the production context contract. */
function context(
  method = "POST",
  requestOrigin = origin,
  path = "/api/services"
) {
  return createNativeRequestContext(
    new Request(`http://localhost${path}`, {
      method,
      headers: { origin: requestOrigin },
    })
  );
}

/** Select the execution policy and unwind the actual-response headers. */
async function execute(
  options: NativeRestConfig = config,
  definition: Action = action,
  requestOrigin = origin
) {
  const cors = createNativeCors({
    config: options,
    services: [{ ...service, actions: [definition] }],
  });
  const current = context("POST", requestOrigin);
  await cors?.select(current, {
    intent: "execute",
    service: "test",
    action: "run",
  });
  cors?.finish(current);
  return current;
}

describe("native CORS", () => {
  it("allows configured origins and preserves defaults", async () => {
    const current = await execute();
    expect(current.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    expect(current.headers.get("Access-Control-Allow-Credentials")).toBe(
      "true"
    );
    expect(current.headers.get("Access-Control-Expose-Headers")).toBe(
      "Content-Length"
    );
    expect(current.headers.get("Vary")).toBe("Origin");
  });

  it("denies unlisted and unconfigured origins", async () => {
    expect(
      (await execute(config, action, "https://evil.example")).headers.has(
        "Access-Control-Allow-Origin"
      )
    ).toBe(false);
    expect(
      (await execute({ ...config, allowedOrigins: [] })).headers.has(
        "Access-Control-Allow-Origin"
      )
    ).toBe(false);
  });

  it("supports wildcard without an Origin Vary value", async () => {
    const current = await execute({
      ...config,
      cors: {
        defaults: { origin: "*", credentials: false, exposeHeaders: [] },
      },
    });
    expect(current.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(current.headers.has("Vary")).toBe(false);
    expect(current.headers.has("Access-Control-Allow-Credentials")).toBe(false);
    expect(current.headers.has("Access-Control-Expose-Headers")).toBe(false);
  });

  it("global hard-off skips every callback and policy", () => {
    const callback = vi.fn(() => origin);
    const controller = createNativeCors({
      config: {
        ...config,
        cors: { enabled: false, defaults: { origin: callback } },
      },
      services: [service],
    });
    expect(controller).toBeUndefined();
    expect(callback).not.toHaveBeenCalled();
  });

  it("disabled actions skip global callbacks and route resolvers", async () => {
    const callback = vi.fn(() => origin);
    const resolver = vi.fn();
    const current = await execute(
      {
        ...config,
        cors: {
          defaults: { origin: callback },
          addCors: [{ path: "/api/*", resolver }],
        },
      },
      { ...action, cors: false }
    );
    expect([...current.headers]).toEqual([]);
    expect(callback).not.toHaveBeenCalled();
    expect(resolver).not.toHaveBeenCalled();
  });

  it("static action overrides merge defaults and supersede path rules", async () => {
    const resolver = vi.fn();
    const current = await execute(
      { ...config, cors: { addCors: [{ path: "/api/*", resolver }] } },
      { ...action, cors: { origin: "*", credentials: false } }
    );
    expect(current.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(current.headers.get("Access-Control-Expose-Headers")).toBe(
      "Content-Length"
    );
    expect(current.headers.has("Access-Control-Allow-Credentials")).toBe(false);
    expect(resolver).not.toHaveBeenCalled();
  });

  it("native action callback replacements receive native request state", async () => {
    const callback = vi.fn(
      (received: string, current: ReturnType<typeof context>) =>
        current.request.headers.has("origin") ? received : null
    );
    const current = await execute(
      { ...config, cors: { actions: { test: { run: { origin: callback } } } } },
      { ...action, cors: { origin: () => "https://old.example" } }
    );
    expect(current.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    expect(callback).toHaveBeenCalledOnce();
  });

  it("fails fast for unported action Hono callbacks", () => {
    expect(() =>
      createNativeCors({
        config,
        services: [
          {
            ...service,
            actions: [{ ...action, cors: { origin: () => origin } }],
          },
        ],
      })
    ).toThrow("requires replacing Hono callbacks");
  });

  it("true native replacement restores inheritance over an old disabled policy", async () => {
    const current = await execute(
      { ...config, cors: { actions: { test: { run: true } } } },
      { ...action, cors: false }
    );
    expect(current.headers.get("Access-Control-Allow-Origin")).toBe(origin);
  });

  it("preserves path/global actual-response layering and Vary values", async () => {
    const current = await execute({
      ...config,
      cors: {
        defaults: { origin: "" },
        addCors: [{ path: "/api/*", options: { origin } }],
      },
    });
    expect(current.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    expect(current.headers.get("Vary")).toBe("Origin, Origin");
  });

  it("keeps discovery and unknown actions on the inherited policy", async () => {
    const cors = createNativeCors({
      config,
      services: [{ ...service, actions: [{ ...action, cors: false }] }],
    });
    for (const routing of [
      { intent: "schema", service: "test", action: "run" },
      { intent: "execute", service: "test", action: "missing" },
    ]) {
      const current = context();
      await cors?.select(current, routing);
      cors?.finish(current);
      expect(current.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    }
  });

  it("preflight ignores action overrides and returns an empty 204", async () => {
    const cors = createNativeCors({
      config,
      services: [{ ...service, actions: [{ ...action, cors: false }] }],
    });
    const current = context("OPTIONS");
    const response = await cors?.preflight(current);
    expect(response?.status).toBe(204);
    expect(await response?.text()).toBe("");
    expect(response?.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    expect(response?.headers.get("Access-Control-Allow-Methods")).toBe(
      "POST,GET,OPTIONS"
    );
    expect(response?.headers.get("Access-Control-Allow-Headers")).toBe(
      "Content-Type,Authorization"
    );
    expect(response?.headers.get("Access-Control-Max-Age")).toBe("600");
    expect(response?.headers.has("Content-Type")).toBe(false);
  });

  it("first matching path policy short-circuits global preflight", async () => {
    const cors = createNativeCors({
      config: {
        ...config,
        cors: {
          defaults: { origin: "" },
          addCors: [
            {
              path: "/api/*",
              options: { origin, allowMethods: ["POST"], maxAge: 5 },
            },
          ],
        },
      },
      services: [service],
    });
    const response = await cors?.preflight(context("OPTIONS"));
    expect(response?.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    expect(response?.headers.get("Access-Control-Allow-Methods")).toBe("POST");
    expect(response?.headers.get("Access-Control-Max-Age")).toBe("5");
  });

  it("reflects requested headers only when allowed headers are empty", async () => {
    const cors = createNativeCors({
      config: { ...config, cors: { defaults: { allowHeaders: [] } } },
      services: [service],
    });
    const current = context("OPTIONS");
    current.request.headers.set(
      "Access-Control-Request-Headers",
      "X-One, X-Two"
    );
    const response = await cors?.preflight(current);
    expect(response?.headers.get("Access-Control-Allow-Headers")).toBe(
      "X-One,X-Two"
    );
    expect(response?.headers.get("Vary")).toBe(
      "Origin, Access-Control-Request-Headers"
    );
  });

  it("failed resolver denies preflight and does not mutate shared defaults", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const cors = createNativeCors({
      config: {
        ...config,
        cors: {
          addCors: [
            {
              path: "/api/*",
              resolver: (_origin, _context, helper) => {
                helper.addHeaders(["X-Temporary"]);
                throw new Error("failed");
              },
            },
          ],
        },
      },
      services: [service],
    });
    const response = await cors?.preflight(context("OPTIONS"));
    expect(response?.headers.has("Access-Control-Allow-Origin")).toBe(false);
    expect(response?.status).toBe(204);
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
    expect((await execute()).headers.get("Access-Control-Allow-Origin")).toBe(
      origin
    );
  });

  it("isolates selected policies and preserves handler overrides before finishing once", async () => {
    const cors = createNativeCors({
      config,
      services: [
        {
          ...service,
          actions: [
            { ...action, cors: false },
            { ...action, name: "enabled" },
          ],
        },
      ],
    });
    const disabled = context();
    const enabled = context();
    await Promise.all([
      cors?.select(disabled, {
        intent: "execute",
        service: "test",
        action: "run",
      }),
      cors?.select(enabled, {
        intent: "execute",
        service: "test",
        action: "enabled",
      }),
    ]);
    enabled.headers.set("Vary", "Accept-Encoding");
    enabled.headers.set(
      "Access-Control-Allow-Origin",
      "https://handler.example"
    );
    await cors?.applyFallback(disabled);
    cors?.finish(disabled);
    cors?.finish(enabled);
    cors?.finish(enabled);
    expect([...disabled.headers]).toEqual([]);
    expect(enabled.headers.get("Vary")).toBe("Accept-Encoding, Origin");
    expect(enabled.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://handler.example"
    );
  });

  it("applies fallback to malformed bodies, custom paths and early responses", async () => {
    const cors = createNativeCors({ config, services: [service] });
    const current = context("GET", origin, "/custom");
    await cors?.applyFallback(current);
    cors?.finish(current);
    expect(current.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    expect(cors?.preflight(current)).toBeUndefined();
  });
  it("does not grant an origin to requests without an Origin header", async () => {
    const cors = createNativeCors({ config, services: [service] });
    const current = createNativeRequestContext(
      new Request("http://localhost/api/services", { method: "POST" })
    );
    await cors?.select(current, {
      intent: "execute",
      service: "test",
      action: "run",
    });
    cors?.finish(current);
    expect(current.headers.has("Access-Control-Allow-Origin")).toBe(false);
  });

  it("does not retry a failed origin callback while preparing error headers", async () => {
    const callback = vi.fn(() => {
      throw new Error("origin failed");
    });
    const cors = createNativeCors({
      config: { ...config, cors: { defaults: { origin: callback } } },
      services: [service],
    });
    const current = context();
    expect(() =>
      cors?.select(current, {
        intent: "execute",
        service: "test",
        action: "run",
      })
    ).toThrow("origin failed");
    await cors?.applyFallback(current);
    cors?.finish(current);
    expect(callback).toHaveBeenCalledOnce();
    expect(current.headers.has("Access-Control-Allow-Origin")).toBe(false);
  });

  it("evaluates native allowed-method callbacks only for preflight", async () => {
    const callback = vi.fn(
      (_origin: string, current: ReturnType<typeof context>) =>
        current.path === "/api/services" ? ["POST"] : ["GET"]
    );
    const cors = createNativeCors({
      config: { ...config, cors: { defaults: { allowMethods: callback } } },
      services: [service],
    });
    await cors?.select(context(), {
      intent: "execute",
      service: "test",
      action: "run",
    });
    expect(callback).not.toHaveBeenCalled();
    const response = await cors?.preflight(context("OPTIONS"));
    expect(response?.headers.get("Access-Control-Allow-Methods")).toBe("POST");
    expect(callback).toHaveBeenCalledOnce();
  });
});
