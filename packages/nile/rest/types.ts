import type { Store } from "hono-rate-limiter";
import type { CorsConfig } from "@/cors/types";

export interface RateLimitConfig {
  windowMs?: number;
  limit?: number;
  standardHeaders?: boolean;
  limitingHeader: string;
  store?: Store;
  diagnostics?: boolean;
}

export interface RestConfig {
  baseUrl: string;
  host?: string;
  port?: number;
  diagnostics?: boolean;
  enableStatic?: boolean;
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
}
