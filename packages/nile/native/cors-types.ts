import type { CorsHelper } from "@/cors/types";
import type { NativeRequestContext } from "./types";

/** CORS callbacks receive native request state rather than a Hono Context. */
export interface NativeCorsOptions {
  origin?:
    | string
    | string[]
    | ((
        origin: string,
        context: NativeRequestContext
      ) => string | undefined | null);
  allowMethods?:
    | string[]
    | ((origin: string, context: NativeRequestContext) => string[]);
  allowHeaders?: string[];
  maxAge?: number;
  credentials?: boolean;
  exposeHeaders?: string[];
}

/** Configure a native path policy using options or the existing helper contract. */
export interface NativeCorsRouteRule {
  path: string;
  options?: NativeCorsOptions;
  resolver?: (
    origin: string,
    context: NativeRequestContext,
    helper: CorsHelper
  ) => void;
}

/** Shared endpoint preflight uses global/path policies, never JSON action identity. */
export interface NativeCorsConfig {
  enabled?: boolean | "default";
  defaults?: NativeCorsOptions;
  addCors?: NativeCorsRouteRule[];
  /** Native replacements for action policies containing Hono-specific callbacks. */
  actions?: Record<string, Record<string, NativeActionCors>>;
}

export type NativeActionCors = boolean | NativeCorsOptions;
