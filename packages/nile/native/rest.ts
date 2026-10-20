import z from "zod";
import { getRequestStore, runInRequestScope } from "../nile/request-scope";
import type { ExternalRequest } from "../nile/types";
import { createHttpBoundary } from "../protection/http";
import { createDiagnosticsLog } from "../utils";
import { createNativeRequestContext } from "./context";
import { createNativeCors } from "./cors";
import {
  checkNativeDiscoveryAccess,
  createNativeIntentHandlers,
} from "./discovery";
import { createNativeMiddleware } from "./middleware";
import { createNativeRateLimiter } from "./rate-limit";
import { createNativeRouter } from "./router";
import { createNativeStaticHandler } from "./static-files";
import type {
  CreateNativeRestAppParams,
  NativeRequestContext,
  NativeRestApp,
} from "./types";
import { handleNativeFormData } from "./uploads";

const requestSchema = z.object({
  intent: z.enum(["explore", "execute", "schema"]),
  service: z.string().min(1),
  action: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
});

/** Native Fetch transport with the existing engine and explicit native context/middleware/route APIs. */
export function createNativeRestApp({
  lifecycle,
  config,
  engine,
  nileContext,
  services,
  serverName,
}: CreateNativeRestAppParams): NativeRestApp {
  const servicesPath = `${config.baseUrl}/services`;
  const cors = createNativeCors({ config, services });
  const limit = createNativeRateLimiter(config);
  const serveStatic = createNativeStaticHandler(config);
  const handlers = createNativeIntentHandlers({ config });
  const middleware = createNativeMiddleware();
  const router = createNativeRouter();
  const log = createDiagnosticsLog("NativeREST", {
    diagnostics: config.diagnostics,
    logger: nileContext.resources?.logger,
  });
  const notFound = (context: NativeRequestContext) =>
    context.json(
      {
        status: false,
        message: `Route not found. Use POST ${servicesPath} for all operations.`,
        data: {},
      },
      404
    );

  /** Parse routing before selecting CORS; keep action execution in its real isolated request scope. */
  const execute = (context: NativeRequestContext) =>
    runInRequestScope(
      {
        ...getRequestStore(),
        nativeRest: context,
        sessions: getRequestStore()?.sessions ?? {},
      },
      async () => {
        if (
          (context.request.headers.get("content-type") ?? "").includes(
            "multipart/form-data"
          )
        ) {
          return handleNativeFormData({
            context,
            config,
            engine,
            nileContext,
            handlers,
            selectCors: cors?.select,
          });
        }
        const body = await context.request.json().catch(() => null);
        if (!body) {
          return context.json(
            {
              status: false,
              message: "Invalid or missing JSON body",
              data: {},
            },
            400
          );
        }
        const pending = cors?.select(context, body);
        if (pending) {
          await pending;
        }
        const parsed = requestSchema.safeParse(body);
        if (!parsed.success) {
          return context.json(
            {
              status: false,
              message: "Invalid request format",
              data: { errors: parsed.error.issues },
            },
            400
          );
        }
        const request: ExternalRequest = parsed.data;
        log(`${request.intent} -> ${request.service}.${request.action}`);
        const discovery = checkNativeDiscoveryAccess(
          request.intent,
          request.payload,
          config
        );
        if (!discovery.allowed) {
          return context.json(
            {
              status: false,
              message: discovery.message ?? "Forbidden",
              data: {},
            },
            403
          );
        }
        const result = await handlers[request.intent](
          engine,
          request,
          nileContext
        );
        return context.json(result, result.status ? 200 : 400);
      }
    );
  router.route("POST", servicesPath, execute);
  if (config.enableStatus) {
    router.route("GET", "/ready", (context) =>
      context.json(
        {
          status: lifecycle?.isReady() ?? true,
          message: lifecycle?.isReady() === false ? "Not ready" : "Ready",
          data: {},
        },
        lifecycle?.isReady() === false ? 503 : 200
      )
    );
    router.route("GET", "/status", (context) =>
      context.json({
        status: true,
        message: `${serverName} is running`,
        data: {},
      })
    );
  }

  /** Native deliberate HTTP errors retain their status; unexpected failures are sanitized. */
  const handleError = (error: Error, context: NativeRequestContext) => {
    let status = 500;
    if (error instanceof URIError) {
      status = 400;
    } else if (
      "status" in error &&
      typeof error.status === "number" &&
      Number.isInteger(error.status) &&
      error.status >= 400 &&
      error.status <= 599
    ) {
      status = error.status;
    }
    if (status === 500) {
      log(`Unhandled error: ${error.message}`, error.stack);
    }
    return context.json(
      {
        status: false,
        message: status === 500 ? "Internal server error" : error.message,
        data: {},
      },
      status
    );
  };

  /** Preserve rate-before-static ordering without entering inactive asynchronous layers. */
  const earlyResponse =
    limit || serveStatic
      ? async (context: NativeRequestContext) => {
          if (limit) {
            const response = await limit(context);
            if (response) {
              return response;
            }
          }
          if (serveStatic && context.path.startsWith("/assets/")) {
            return serveStatic(context);
          }
        }
      : undefined;

  /** Apply terminal/preflight layers before routes, then unwind selected CORS after the final response. */
  const fetch = (request: Request): Promise<Response> => {
    const context = createNativeRequestContext(request);
    const dispatch = async () => {
      if (request.method === "OPTIONS" && cors) {
        return cors.preflight(context);
      }
      if (request.method !== "POST" || context.path !== servicesPath) {
        const pending = cors?.applyFallback(context);
        if (pending) {
          await pending;
        }
      }
      if (earlyResponse) {
        const response = await earlyResponse(context);
        if (response) {
          return response;
        }
      }
      return middleware.run(context, () => {
        const handler = router.match(context);
        return handler ? handler(context) : notFound(context);
      });
    };
    const finish = async (response?: Response): Promise<Response> => {
      context.respond(response ?? notFound(context));
      const pending = cors?.applyFallback(context);
      if (pending) {
        await pending;
      }
      cors?.finish(context);
      const final = context.response;
      if (!final) {
        throw new Error("Native transport completed without a response");
      }
      if (request.method === "HEAD") {
        return new Response(null, {
          status: final.status,
          statusText: final.statusText,
          headers: final.headers,
        });
      }
      return final;
    };
    return dispatch()
      .then(finish)
      .catch((failure: Error) => {
        const error =
          failure instanceof Error ? failure : new Error(String(failure));
        handleError(error, context);
        return finish(context.response);
      });
  };
  const boundary = createHttpBoundary(config.protection, lifecycle);
  return {
    fetch: (request) => boundary(request, fetch),
    route: router.route,
    addMiddleware: middleware.addMiddleware,
  };
}
