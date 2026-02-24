import type { CorsConfig } from "@/cors/types";

export type RestConfig = {
  baseUrl: string;
  host?: string;
  port?: string;
  enableStatic?: boolean;
  enableStatus?: boolean;
  rateLimiting?: {
    windowMs?: number;
    limit?: number;
    standardHeaders?: boolean;
    limitingHeader: string;
    store?: any;
    diagnostics?: boolean;
  };
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
};