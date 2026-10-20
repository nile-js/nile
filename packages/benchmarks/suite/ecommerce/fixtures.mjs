import { Hono } from "hono";
import { cors } from "hono/cors";
import { sign } from "hono/jwt";
import { Elysia } from "elysia";
import { createNileServer, verifyJWT } from "../../../nile/dist/index.js";
import {
  createDefinitions,
  createStore,
  CUSTOMER,
  OPERATIONS,
  ORIGIN,
  SECRET,
  serializeResult,
  SHOPS,
} from "./workload.mjs";

export const CONTENDERS = ["nile-native", "nile-hono", "bun", "hono", "elysia"];
export const CORS = {
  origin: ORIGIN,
  credentials: true,
  allowMethods: ["POST", "GET", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  exposeHeaders: ["Content-Length"],
  maxAge: 600,
};

/** Use the same JWT implementation and claims as Nile, without implementing a second verifier. */
export async function executeRequest({ request, payload, definition, store, mode }) {
  const auth = await verifyJWT(
    { headers: request.headers },
    { secret: SECRET }
  );
  if (auth.isErr) {
    return {
      status: 400,
      body: { status: false, message: auth.error, data: {} },
    };
  }
  let input = payload;
  if (mode === "validated") {
    const parsed = definition.schema.safeParse(payload);
    if (!parsed.success) {
      return {
        status: 400,
        body: { status: false, message: "Invalid input", data: {} },
      };
    }
    input = parsed.data;
  }
  const result = store.execute(
    definition.shop,
    definition.operation,
    input,
    auth.value.userId
  );
  return {
    status: result.isOk ? 200 : 400,
    body: serializeResult(definition.shop, definition.operation, result),
  };
}

/** CORS baseline matches Nile defaults; preflight bypasses parsing/authentication in every contender. */
export function createCorsHeaders(request, preflight = false) {
  const headers = new Headers({
    vary: "Origin",
    "access-control-allow-credentials": "true",
    "access-control-expose-headers": "Content-Length",
  });
  if (request.headers.get("origin") === ORIGIN) {
    headers.set("access-control-allow-origin", ORIGIN);
  }
  if (preflight) {
    headers.set("access-control-allow-methods", CORS.allowMethods.join(","));
    headers.set("access-control-allow-headers", CORS.allowHeaders.join(","));
    headers.set("access-control-max-age", "600");
  }
  return headers;
}

/** Initialize exactly one contender per child; state is reset between admission, warmup and measurement. */
export async function createFixture(framework, mode) {
  if (
    !(CONTENDERS.includes(framework) && ["plain", "validated"].includes(mode))
  ) {
    throw new Error("Invalid fixture selection");
  }
  const store = createStore();
  const definitions = createDefinitions();
  const token = await sign(
    {
      sub: CUSTOMER,
      organizationId: "benchmark",
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
    SECRET,
    "HS256"
  );
  const headers = {
    origin: ORIGIN,
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
  const base = {
    headers,
    reset: store.reset,
    state: store.state,
    routeCount: definitions.length,
  };
  if (framework.startsWith("nile-")) {
    const server = await createNileServer({
      serverName: "Ecommerce benchmark",
      runtime: "bun",
      native: framework === "nile-native",
      forceNewInstance: true,
      logServices: false,
      auth: { secret: SECRET },
      rest: { baseUrl: "/api", allowedOrigins: [ORIGIN] },
      services: SHOPS.map((shop) => ({
        name: shop,
        description: "Storefront",
        actions: OPERATIONS.map((operation) => {
          const definition = definitions.find(
            (entry) => entry.shop === shop && entry.operation === operation
          );
          return {
            name: operation,
            description: operation,
            isProtected: true,
            ...(mode === "validated" ? { validation: definition.schema } : {}),
            handler: (payload, context) =>
              store.execute(
                shop,
                operation,
                payload,
                context.getSession("rest")?.userId
              ),
          };
        }),
      })),
    });
    const fetch =
      framework === "nile-native"
        ? server.nativeRest.fetch
        : (request) => server.rest.app.fetch(request);
    return {
      ...base,
      fetch,
      start: () => Bun.serve({ hostname: "127.0.0.1", port: 0, fetch }),
    };
  }
  if (framework === "hono") {
    const app = new Hono();
    app.use("*", cors(CORS));
    definitions.forEach((definition) => {
      app.post(definition.path, async (context) => {
        const result = await executeRequest({
          request: context.req.raw,
          payload: await context.req.json(),
          definition,
          store,
          mode,
        });
        return context.json(result.body, result.status);
      });
    });
    return {
      ...base,
      fetch: app.fetch,
      start: () =>
        Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: app.fetch }),
    };
  }
  if (framework === "elysia") {
    const app = new Elysia().onRequest(({ request, set }) => {
      const preflight = request.method === "OPTIONS";
      const headers = createCorsHeaders(request, preflight);
      headers.forEach((value, key) => {
        set.headers[key] = value;
      });
      if (preflight) {
        return new Response(null, { status: 204, headers });
      }
    });
    definitions.forEach((definition) => {
      app.post(definition.path, async ({ request, body, set }) => {
        const result = await executeRequest({
          request,
          payload: body,
          definition,
          store,
          mode,
        });
        set.status = result.status;
        return result.body;
      });
    });
    app.compile();
    return {
      ...base,
      fetch: app.fetch,
      start: () => {
        app.listen({ hostname: "127.0.0.1", port: 0 });
        return app.server;
      },
    };
  }
  const routes = Object.fromEntries(
    definitions.map((definition) => [
      definition.path,
      {
        POST: async (request) => {
          const result = await executeRequest({
            request,
            payload: await request.json(),
            definition,
            store,
            mode,
          });
          return Response.json(result.body, {
            status: result.status,
            headers: createCorsHeaders(request),
          });
        },
        OPTIONS: (request) =>
          new Response(null, {
            status: 204,
            headers: createCorsHeaders(request, true),
          }),
      },
    ])
  );
  const fetch = (request) => {
    const route = routes[new URL(request.url).pathname]?.[request.method];
    return route ? route(request) : new Response(null, { status: 404 });
  };
  return {
    ...base,
    fetch,
    start: () =>
      Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        routes,
        fetch: () => new Response(null, { status: 404 }),
      }),
  };
}
