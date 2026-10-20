import type { Context } from "hono";
import type { CorsOptions } from "./types";

/** Apply compiled CORS headers to an actual response through Hono's header lifecycle. */
export type CompiledCorsPolicy = (context: Context) => void;

/** Prepare headers before execution and Vary after it, preserving handler overrides. */
export function prepareCorsPolicy(options: CorsOptions): {
  apply: CompiledCorsPolicy;
  finish: CompiledCorsPolicy;
} {
  const origin = options.origin ?? "*";
  const exposeHeaders = options.exposeHeaders?.length
    ? options.exposeHeaders.join(",")
    : undefined;
  const credentials = options.credentials === true;
  const varyOrigin = origin !== "*";
  const allowedOrigins = Array.isArray(origin) ? new Set(origin) : undefined;
  const resolveOrigin =
    typeof origin === "function"
      ? origin
      : (requestOrigin: string) => {
          if (origin === "*") {
            return "*";
          }
          if (allowedOrigins) {
            return allowedOrigins.has(requestOrigin) ? requestOrigin : null;
          }
          return origin === requestOrigin ? requestOrigin : null;
        };

  const apply: CompiledCorsPolicy = (context) => {
    const allowedOrigin = resolveOrigin(
      context.req.header("Origin") || "",
      context
    );
    if (allowedOrigin) {
      context.header("Access-Control-Allow-Origin", allowedOrigin);
    }
    if (credentials) {
      context.header("Access-Control-Allow-Credentials", "true");
    }
    if (exposeHeaders) {
      context.header("Access-Control-Expose-Headers", exposeHeaders);
    }
  };
  const finish: CompiledCorsPolicy = varyOrigin
    ? (context) => context.header("Vary", "Origin", { append: true })
    : () => undefined;
  return { apply, finish };
}

/** Compile a single-step actual-response policy when separate phases are unnecessary. */
export function compileCorsPolicy(options: CorsOptions): CompiledCorsPolicy {
  const policy = prepareCorsPolicy(options);
  return (context) => {
    policy.apply(context);
    policy.finish(context);
  };
}
