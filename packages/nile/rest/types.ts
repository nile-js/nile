import type { Context } from "hono";
import type { Store } from "hono-rate-limiter";
import type { CorsConfig } from "@/cors/types";

/** A user-registered middleware entry for the services pipeline */
export interface MiddlewareEntry {
  path: string;
  fn: (c: Context, next: () => Promise<void>) => Promise<undefined | Response>;
}

export interface RateLimitConfig {
  windowMs?: number;
  limit?: number;
  standardHeaders?: boolean;
  limitingHeader: string;
  store?: Store;
  diagnostics?: boolean;
}

/** Configuration for API discovery (explore/schema intents) */
export interface DiscoveryConfig {
  /** Enable API discovery — when false, explore/schema intents are rejected (default: false) */
  enabled?: boolean;
  /** When set, the client must include this value as `discoverySecret` in the request payload */
  secret?: string;
}

export interface RestConfig {
  baseUrl: string;
  host?: string;
  port?: number;
  diagnostics?: boolean;
  enableStatic?: boolean;
  /** Directory to serve static files from (default: "./assets") */
  staticDir?: string;
  enableStatus?: boolean;
  rateLimiting?: RateLimitConfig;
  allowedOrigins: string[];
  cors?: CorsConfig;
  uploads?: {
    enforceContentType?: boolean;
    limits?: {
      maxFiles?: number;
      maxFileSize?: number;
      minFileSize?: number;
      maxTotalSize?: number;
      maxFilenameLength?: number;
    };
    allow?: {
      mimeTypes?: string[];
      extensions?: string[];
    };
    diagnostics?: boolean;
  };
  /** API discovery configuration — controls explore/schema intent access */
  discovery?: DiscoveryConfig;
}
