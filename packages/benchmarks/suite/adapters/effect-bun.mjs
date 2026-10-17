import { BunHttpServer } from "@effect/platform-bun";
import { Effect, Layer } from "effect";
import { HttpRouter } from "effect/http";
import { createEffectRoutes } from "./effect.mjs";

/** Return Bun's native HTTP layer; importing this module never starts a listener. */
export const createEffectBunServerLayer = ({ mode = "plain", port, onReady }) =>
  HttpRouter.serve(createEffectRoutes({ mode }), {
    disableLogger: true,
    disableListenLog: true,
  }).pipe(
    Layer.provide(BunHttpServer.layer({ port, hostname: "127.0.0.1" })),
    Layer.tap(() => Effect.sync(() => onReady?.()))
  );
