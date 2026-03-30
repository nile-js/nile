import type { Hono } from "hono";
import { cors } from "hono/cors";
import type { RestConfig } from "@/rest/types";
import type { CorsConfig, CorsHelper, CorsOptions } from "./types";

/**
 * Build default CORS options from REST config
 */
export const buildDefaultCorsOptions = (config: RestConfig): CorsOptions => {
  const getDefaultOrigin = (reqOrigin: string) => {
    if (config.allowedOrigins.length > 0) {
      return config.allowedOrigins.includes(reqOrigin ?? "") ? reqOrigin : "";
    }
    // No origins configured — deny by default (empty string = no CORS headers)
    return "";
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
 * Creates a CorsHelper instance pre-loaded with default options.
 * Methods mutate internal state. After the resolver runs, call `toOptions()` to get the final CorsOptions.
 */
function createCorsHelper(
  defaults: CorsOptions
): CorsHelper & { toOptions: () => CorsOptions } {
  const state: CorsOptions = { ...defaults };
  // Clone arrays to avoid mutating the defaults object
  if (Array.isArray(defaults.allowHeaders)) {
    state.allowHeaders = [...defaults.allowHeaders];
  }
  if (Array.isArray(defaults.allowMethods)) {
    state.allowMethods = [...defaults.allowMethods];
  }
  if (Array.isArray(defaults.exposeHeaders)) {
    state.exposeHeaders = [...defaults.exposeHeaders];
  }

  return {
    allowOrigin: (origin: string) => {
      state.origin = origin;
    },
    deny: () => {
      state.origin = "";
    },
    addHeaders: (headers: string[]) => {
      const current = Array.isArray(state.allowHeaders)
        ? state.allowHeaders
        : [];
      state.allowHeaders = [...current, ...headers];
    },
    setHeaders: (headers: string[]) => {
      state.allowHeaders = headers;
    },
    setMethods: (methods: string[]) => {
      state.allowMethods = methods;
    },
    setCredentials: (value: boolean) => {
      state.credentials = value;
    },
    setMaxAge: (seconds: number) => {
      state.maxAge = seconds;
    },
    setExposeHeaders: (headers: string[]) => {
      state.exposeHeaders = headers;
    },
    toOptions: () => state,
  };
}

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
 * Apply resolver-based CORS for a specific path.
 * Creates a CorsHelper pre-loaded with defaults and passes it to the resolver.
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
    const helper = createCorsHelper(defaultOpts);

    try {
      resolver(reqOrigin, c, helper);
    } catch (error) {
      // Security: deny on resolver failure — never fall through to allow
      console.error("CORS resolver error:", error);
      helper.deny();
    }

    const corsOpts = helper.toOptions();
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
