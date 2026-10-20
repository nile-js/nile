import { createServer } from "node:http";
import { Effect, Layer, ManagedRuntime } from "effect";
import {
  HttpRouter,
  HttpServer,
  HttpServerRequest,
  HttpServerResponse,
} from "effect/http";
import { sign } from "hono/jwt";
import { safeTry } from "slang-ts";
import { createCorsHeaders, executeRequest } from "../fixtures.mjs";
import {
  createDefinitions,
  createStore,
  CUSTOMER,
  ORIGIN,
  SECRET,
} from "../workload.mjs";

/** Keep the shared credential/CORS helpers independent of Effect's native header representation. */
function readRequest(request) {
  return { headers: new Headers(request.headers) };
}

/** Register real Effect routes; only JSON reading and response serialization use Effect's platform APIs. */
function createRoutes({ definitions, store, mode }) {
  const routes = definitions.flatMap((definition) => [
    HttpRouter.route(
      "POST",
      definition.path,
      Effect.gen(function* () {
        const incoming = yield* HttpServerRequest.HttpServerRequest;
        const request = readRequest(incoming);
        const payload = yield* incoming.json;
        const result = yield* Effect.promise(() =>
          executeRequest({ request, payload, definition, store, mode }),
        );
        return yield* HttpServerResponse.json(result.body, {
          status: result.status,
          headers: Object.fromEntries(createCorsHeaders(request)),
        });
      }).pipe(
        Effect.catch(() =>
          HttpServerResponse.json(
            { status: false, message: "Invalid request body", data: {} },
            { status: 400 },
          ),
        ),
      ),
    ),
    HttpRouter.route(
      "OPTIONS",
      definition.path,
      Effect.gen(function* () {
        const incoming = yield* HttpServerRequest.HttpServerRequest;
        return HttpServerResponse.empty({
          status: 204,
          headers: Object.fromEntries(
            createCorsHeaders(readRequest(incoming), true),
          ),
        });
      }),
    ),
  ]);
  return HttpRouter.addAll(routes);
}

/** Construct a native Effect application without opening sockets or acquiring server services. */
export async function createEffectFixture({ mode, runtime }) {
  if (
    !["plain", "validated"].includes(mode) ||
    !["bun", "node"].includes(runtime)
  )
    throw new Error("Invalid Effect fixture selection");
  const store = createStore();
  const definitions = createDefinitions();
  const routes = createRoutes({ definitions, store, mode });
  const token = await sign(
    {
      sub: CUSTOMER,
      organizationId: "benchmark",
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
    SECRET,
    "HS256",
  );
  return {
    headers: {
      origin: ORIGIN,
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    reset: store.reset,
    state: store.state,
    routeCount: definitions.length,
    /** Use Fetch conversion solely for correctness checks; measured serving uses the native layers. */
    createWebHandler: () =>
      HttpRouter.toWebHandler(routes, { disableLogger: true }),
    async start() {
      const platform =
        runtime === "bun"
          ? (await import("@effect/platform-bun")).BunHttpServer.layer({
              hostname: "127.0.0.1",
              port: 0,
            })
          : (await import("@effect/platform-node")).NodeHttpServer.layer(
              () => createServer(),
              { host: "127.0.0.1", port: 0 },
            );
      const application = HttpRouter.serve(routes, {
        disableLogger: true,
        disableListenLog: true,
      }).pipe(Layer.provideMerge(platform));
      const managed = ManagedRuntime.make(application);
      const result = await safeTry(() =>
        managed.runPromise(HttpServer.addressFormattedWith(Effect.succeed)),
      );
      if (result.isErr) {
        await managed.dispose();
        throw new Error("Effect server initialization failed", {
          cause: result.error,
        });
      }
      return { url: result.value, close: () => managed.dispose() };
    },
  };
}
