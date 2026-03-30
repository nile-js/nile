import type { Context } from "hono";

/**
 * CORS options compatible with Hono's cors middleware
 */
export interface CorsOptions {
  /**
   * The value of "Access-Control-Allow-Origin" CORS header.
   * Can be a string, array of strings, or a function that returns the allowed origin.
   */
  origin?:
    | string
    | string[]
    | ((origin: string, c: Context) => string | undefined | null);

  /**
   * The value of "Access-Control-Allow-Methods" CORS header.
   * Can be an array of HTTP methods or a function that returns allowed methods.
   */
  allowMethods?: string[] | ((origin: string, c: Context) => string[]);

  /**
   * The value of "Access-Control-Allow-Headers" CORS header.
   */
  allowHeaders?: string[];

  /**
   * The value of "Access-Control-Max-Age" CORS header.
   */
  maxAge?: number;

  /**
   * The value of "Access-Control-Allow-Credentials" CORS header.
   */
  credentials?: boolean;

  /**
   * The value of "Access-Control-Expose-Headers" CORS header.
   */
  exposeHeaders?: string[];
}

/**
 * Helper object passed to CORS resolvers — pre-loaded with server defaults.
 * Call methods to override specific settings. If nothing is called, defaults apply.
 */
export interface CorsHelper {
  /** Allow this specific origin */
  allowOrigin: (origin: string) => void;
  /** Deny the request (no CORS headers sent) */
  deny: () => void;
  /** Add headers on top of defaults (appends, doesn't replace) */
  addHeaders: (headers: string[]) => void;
  /** Override allowed headers entirely */
  setHeaders: (headers: string[]) => void;
  /** Override allowed methods */
  setMethods: (methods: string[]) => void;
  /** Set credentials flag */
  setCredentials: (value: boolean) => void;
  /** Set preflight cache max age in seconds */
  setMaxAge: (seconds: number) => void;
  /** Set exposed headers */
  setExposeHeaders: (headers: string[]) => void;
}

/**
 * CORS resolver function that uses helpers to configure CORS per-request.
 * The helper is pre-loaded with server defaults — only call what you need to override.
 * If nothing is called, defaults apply (allow). Call cors.deny() to reject.
 */
export type CorsResolver = (
  origin: string,
  c: Context,
  cors: CorsHelper
) => void;

/**
 * Per-route CORS configuration
 */
export interface CorsRouteRule {
  /**
   * Path pattern to match (e.g., '/api/*', '/uploads/*')
   */
  path: string;

  /**
   * Static CORS options for this route
   */
  options?: CorsOptions;

  /**
   * Dynamic resolver function to determine CORS behavior per request
   */
  resolver?: CorsResolver;
}

/**
 * Main CORS configuration for the REST server
 */
export interface CorsConfig {
  /**
   * Enable or disable CORS
   * - `true` or `'default'`: Use default CORS configuration
   * - `false`: Disable CORS middleware entirely (no CORS headers are set)
   */
  enabled?: boolean | "default";

  /**
   * Default CORS options applied globally
   */
  defaults?: CorsOptions;

  /**
   * Additional route-specific CORS rules
   */
  addCors?: CorsRouteRule[];
}
