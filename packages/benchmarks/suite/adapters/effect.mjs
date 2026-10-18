import { createServer } from "node:http";
import { NodeHttpServer } from "@effect/platform-node";
import { Effect, Layer, Schema } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http";
import {
  inputSchema,
  ACTION_COUNT,
  calculateResult,
} from "../shared/workload.mjs";

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
export const createEffectRoutes = ({
  mode = "plain",
  execute = calculateResult,
} = {}) => {
  const readBody = createBodyReader(mode);
  const routes = Array.from({ length: ACTION_COUNT }, (_, action) =>
    HttpRouter.route(
      "POST",
      `/actions/action-${action}`,
      Effect.gen(function* () {
        const body = yield* readBody;
        const result = yield* Effect.sync(() =>
          execute({ payload: body, action })
        );
        return yield* HttpServerResponse.json(result);
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
export const createEffectServerLayer = ({
  mode = "plain",
  port,
  onReady,
  execute = calculateResult,
}) =>
  HttpRouter.serve(createEffectRoutes({ mode, execute }), {
    disableLogger: true,
    disableListenLog: true,
  }).pipe(
    Layer.provide(
      NodeHttpServer.layer(() => createServer(), { port, host: "127.0.0.1" })
    ),
    Layer.tap(() => Effect.sync(() => onReady?.()))
  );

/** Create a Fetch handler solely for non-listening fixture correctness checks. */
export const createEffectWebHandler = ({
  mode = "plain",
  execute = calculateResult,
} = {}) =>
  HttpRouter.toWebHandler(createEffectRoutes({ mode, execute }), {
    disableLogger: true,
  });
