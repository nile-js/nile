import { createServer } from "node:http";
import { NodeHttpServer } from "@effect/platform-node";
import { Effect, Layer, Schema } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http";
import { z } from "zod";

const ROUTE_COUNT = 300;
const inputSchema = z.object({
  id: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  value: z.number().int().min(0).max(999),
});
const nativeInputSchema = Schema.Struct({
  id: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
  value: Schema.Number.check(
    Schema.isInt(),
    Schema.isGreaterThanOrEqualTo(0),
    Schema.isLessThanOrEqualTo(999)
  ),
});

/** Select parsing once while constructing the application, outside measured requests. */
const createBodyReader = (mode) => {
  if (mode === "native") {
    return HttpServerRequest.schemaBodyJson(nativeInputSchema);
  }
  const readJson = Effect.flatMap(
    HttpServerRequest.HttpServerRequest,
    (request) => request.json
  );
  if (mode === "plain") {
    return readJson;
  }
  if (mode !== "validated") {
    throw new Error(`Unsupported Effect benchmark mode: ${mode}`);
  }
  return Effect.flatMap(readJson, (body) => {
    const result = inputSchema.safeParse(body);
    return result.success
      ? Effect.succeed(result.data)
      : Effect.fail("INVALID_INPUT");
  });
};

/** Build 300 native Effect routes without opening a listening socket. */
export const createEffectRoutes = ({ mode = "plain" } = {}) => {
  const readBody = createBodyReader(mode);
  const routes = Array.from({ length: ROUTE_COUNT }, (_, action) =>
    HttpRouter.route(
      "POST",
      `/actions/action-${action}`,
      Effect.gen(function* () {
        const body = yield* readBody;
        return yield* HttpServerResponse.json({
          id: body.id,
          value: body.value + 1,
          action,
        });
      }).pipe(
        Effect.catch(() =>
          HttpServerResponse.json(
            { message: "Invalid request body" },
            { status: 400 }
          )
        )
      )
    )
  );
  return HttpRouter.addAll(routes);
};

/** Return the native Node server layer; only the user's launcher may run it. */
export const createEffectServerLayer = ({ mode = "plain", port, onReady }) =>
  HttpRouter.serve(createEffectRoutes({ mode }), {
    disableLogger: true,
    disableListenLog: true,
  }).pipe(
    Layer.provide(
      NodeHttpServer.layer(() => createServer(), { port, host: "127.0.0.1" })
    ),
    Layer.tap(() => Effect.sync(() => onReady?.()))
  );

/** Create a Fetch handler solely for non-listening fixture correctness checks. */
export const createEffectWebHandler = ({ mode = "plain" } = {}) =>
  HttpRouter.toWebHandler(createEffectRoutes({ mode }), {
    disableLogger: true,
  });
