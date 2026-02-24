import type { Context, Hono } from 'hono';
import { cors } from 'hono/cors';
import type { CorsConfig, CorsOptions } from './types';
import type { AppContext, ServerConfig } from './rest-server';

/**
 * Build default CORS options from server config
 */
export const buildDefaultCorsOptions = (config: ServerConfig): CorsOptions => {
  const getDefaultOrigin = (reqOrigin: string) => {
    if (config.allowedOrigins.length > 0) {
      return config.allowedOrigins.includes(reqOrigin ?? '') ? reqOrigin : '';
    }
    return '*';
  };

  return {
    origin: config.cors?.defaults?.origin ?? getDefaultOrigin,
    credentials: config.cors?.defaults?.credentials ?? true,
    allowHeaders: config.cors?.defaults?.allowHeaders ?? [
      'Content-Type',
      'Authorization',
    ],
    allowMethods: config.cors?.defaults?.allowMethods ?? [
      'POST',
      'GET',
      'OPTIONS',
    ],
    exposeHeaders: config.cors?.defaults?.exposeHeaders ?? ['Content-Length'],
    maxAge: config.cors?.defaults?.maxAge ?? 600,
  };
};

/**
 * Apply CORS configuration to Hono app
 */
export const applyCorsConfig = (
  app: Hono<AppContext>,
  config: ServerConfig
): void => {
  const corsEnabled = config.cors?.enabled ?? 'default';

  if (corsEnabled === false) {
    // CORS disabled - skip middleware
    return;
  }

  const defaultCorsOpts = buildDefaultCorsOptions(config);

  // Apply route-specific CORS rules FIRST (before global catch-all)
  const corsRules = config.cors?.addCors ?? [];
  for (const rule of corsRules) {
    applyRouteCorsRule(app, rule, defaultCorsOpts);
  }

  // Apply global CORS as fallback
  app.use('*', cors(defaultCorsOpts as any));
};

/**
 * Apply a single route-specific CORS rule
 */
const applyRouteCorsRule = (
  app: Hono<AppContext>,
  rule: NonNullable<CorsConfig['addCors']>[number],
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
  app: Hono<AppContext>,
  path: string,
  resolver: NonNullable<CorsConfig['addCors']>[number]['resolver'],
  defaultOpts: CorsOptions
): void => {
  if (!resolver) {
    return;
  }

  app.use(path, (c, next) => {
    const reqOrigin = c.req.header('origin') ?? '';
    const corsOpts = evaluateResolver(resolver, reqOrigin, c, defaultOpts);
    return cors(corsOpts as any)(c, next);
  });
};

/**
 * Apply static CORS options for a specific path
 */
const applyStaticCors = (
  app: Hono<AppContext>,
  path: string,
  options: CorsOptions,
  defaultOpts: CorsOptions
): void => {
  app.use(path, cors({ ...defaultOpts, ...options } as any));
};

/**
 * Evaluate CORS resolver and return appropriate options
 */
const evaluateResolver = (
  resolver: NonNullable<CorsConfig['addCors']>[number]['resolver'],
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
      return { ...defaultOpts, origin: origin || '*' };
    }

    if (result === false) {
      return { ...defaultOpts, origin: '' };
    }

    if (result && typeof result === 'object') {
      return { ...defaultOpts, ...result };
    }

    return defaultOpts;
  } catch (error) {
    console.error('CORS resolver error:', error);
    return defaultOpts;
  }
};
