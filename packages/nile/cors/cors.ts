import type { Context, Hono } from "hono";
import { cors } from "hono/cors";
import type { RestConfig } from "@/rest/types";
import type { CorsConfig, CorsOptions } from "./types";

/**
 * Build default CORS options from REST config
 */
export const buildDefaultCorsOptions = (config: RestConfig): CorsOptions => {
  const getDefaultOrigin = (reqOrigin: string) => {
    if (config.allowedOrigins.length > 0) {
      return config.allowedOrigins.includes(reqOrigin ?? "") ? reqOrigin : "";
    }
    return "*";
  };

  return {
    origin: config.cors?.defaults?.origin ?? getDefaultOrigin,
    credentials: config.cors?.defaults?.credentials ?? true,
    allowHeaders: config.cors?.defaults?.allowHeaders ?? [
      "Content-Type",
      "Authorization",
    ],
    allowMethods: config.cors?.defaults?.allowMethods ?? [
      "POST",
      "GET",
      "OPTIONS",
    ],
    exposeHeaders: config.cors?.defaults?.exposeHeaders ?? ["Content-Length"],
    maxAge: config.cors?.defaults?.maxAge ?? 600,
  };
};

/**
 * Apply CORS configuration to a Hono app based on RestConfig
 */
export const applyCorsConfig = (app: Hono, config: RestConfig): void => {
  const corsEnabled = config.cors?.enabled ?? "default";

  if (corsEnabled === false) {
    return;
  }

  const defaultCorsOpts = buildDefaultCorsOptions(config);

  // Apply route-specific CORS rules FIRST (before global catch-all)
  const corsRules = config.cors?.addCors ?? [];
  for (const rule of corsRules) {
    applyRouteCorsRule(app, rule, defaultCorsOpts);
  }

  // Apply global CORS as fallback
  app.use("*", cors(defaultCorsOpts as Parameters<typeof cors>[0]));
};

/**
 * Apply a single route-specific CORS rule
 */
const applyRouteCorsRule = (
  app: Hono,
  rule: NonNullable<CorsConfig["addCors"]>[number],
  defaultOpts: CorsOptions
): void => {
  if (rule.resolver) {
    applyResolverBasedCors(app, rule.path, rule.resolver, defaultOpts);
  } else if (rule.options) {
    applyStaticCors(app, rule.path, rule.options, defaultOpts);
  }
};

/**
 * Apply resolver-based CORS for a specific path
 */
const applyResolverBasedCors = (
  app: Hono,
  path: string,
  resolver: NonNullable<CorsConfig["addCors"]>[number]["resolver"],
  defaultOpts: CorsOptions
): void => {
  if (!resolver) {
    return;
  }

  app.use(path, (c, next) => {
    const reqOrigin = c.req.header("origin") ?? "";
    const corsOpts = evaluateResolver(resolver, reqOrigin, c, defaultOpts);
    return cors(corsOpts as Parameters<typeof cors>[0])(c, next);
  });
};

/**
 * Apply static CORS options for a specific path
 */
const applyStaticCors = (
  app: Hono,
  path: string,
  options: CorsOptions,
  defaultOpts: CorsOptions
): void => {
  app.use(
    path,
    cors({ ...defaultOpts, ...options } as Parameters<typeof cors>[0])
  );
};

/**
 * Evaluate CORS resolver and return appropriate options
 */
const evaluateResolver = (
  resolver: NonNullable<CorsConfig["addCors"]>[number]["resolver"],
  origin: string,
  c: Context,
  defaultOpts: CorsOptions
): CorsOptions => {
  if (!resolver) {
    return defaultOpts;
  }

  try {
    const result = resolver(origin, c);

    if (result === true) {
      return { ...defaultOpts, origin: origin || "*" };
    }

    if (result === false) {
      return { ...defaultOpts, origin: "" };
    }

    if (result && typeof result === "object") {
      return { ...defaultOpts, ...result };
    }

    return defaultOpts;
  } catch (error) {
    // Security: deny on resolver failure — never fall through to allow
    console.error("CORS resolver error:", error);
    return { ...defaultOpts, origin: "" };
  }
};
