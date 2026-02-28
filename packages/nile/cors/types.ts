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
 * CORS resolver function that determines CORS behavior per request
 * - Return `true` to allow the origin with default options
 * - Return `false` to reject the request
 * - Return a CorsOptions object to override options for this request
 */
export type CorsResolver = (
  origin: string,
  c: Context
) => boolean | CorsOptions | undefined;

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
