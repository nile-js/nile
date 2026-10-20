import type { NativeCorsOptions } from "./cors-types";
import type { NativeRequestContext } from "./types";

type Apply = (context: NativeRequestContext) => void;

/** Precompile actual-response headers and keep Vary in the response unwind phase. */
export function prepareNativeCorsPolicy(options: NativeCorsOptions): {
  apply: Apply;
  finish: Apply;
  preflight: (context: NativeRequestContext) => Response;
} {
  const origin = options.origin ?? "*";
  const origins = Array.isArray(origin) ? new Set(origin) : undefined;
  const expose = options.exposeHeaders?.join(",");
  const allowedHeaders = options.allowHeaders?.join(",");
  const methods = Array.isArray(options.allowMethods)
    ? options.allowMethods.join(",")
    : undefined;
  const finish: Apply =
    origin === "*"
      ? () => undefined
      : (context) => {
          context.headers.append("Vary", "Origin");
        };
  const resolveOrigin = (context: NativeRequestContext) => {
    const requestOrigin = context.request.headers.get("origin") ?? "";
    if (typeof origin === "function") {
      return origin(requestOrigin, context);
    }
    if (origin === "*") {
      return "*";
    }
    if (origins) {
      return origins.has(requestOrigin) ? requestOrigin : null;
    }
    return origin === requestOrigin ? requestOrigin : null;
  };
  const apply: Apply = (context) => {
    const allowed = resolveOrigin(context);
    if (allowed) {
      context.headers.set("Access-Control-Allow-Origin", allowed);
    }
    if (options.credentials) {
      context.headers.set("Access-Control-Allow-Credentials", "true");
    }
    if (expose) {
      context.headers.set("Access-Control-Expose-Headers", expose);
    }
  };
  return {
    apply,
    finish,
    preflight: (context) => {
      apply(context);
      finish(context);
      if (options.maxAge != null) {
        context.headers.set("Access-Control-Max-Age", String(options.maxAge));
      }
      const allowedMethods =
        typeof options.allowMethods === "function"
          ? options
              .allowMethods(
                context.request.headers.get("origin") ?? "",
                context
              )
              .join(",")
          : methods;
      if (allowedMethods) {
        context.headers.set("Access-Control-Allow-Methods", allowedMethods);
      }
      const headers =
        allowedHeaders ||
        context.request.headers
          .get("Access-Control-Request-Headers")
          ?.split(",")
          .map((value) => value.trim())
          .join(",");
      if (headers) {
        context.headers.set("Access-Control-Allow-Headers", headers);
        context.headers.append("Vary", "Access-Control-Request-Headers");
      }
      context.headers.delete("Content-Length");
      context.headers.delete("Content-Type");
      return new Response(null, {
        status: 204,
        statusText: "No Content",
        headers: context.headers,
      });
    },
  };
}
