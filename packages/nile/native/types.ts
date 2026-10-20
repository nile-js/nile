import type { Engine, Service } from "../engine/types";
import type { NileLifecycle } from "../lifecycle/types";
import type { NileContext } from "../nile/types";
import type { RestConfig } from "../rest/types";
import type { NativeCorsConfig } from "./cors-types";

export type NativeService = Service;
export type NativeStateValue =
  | object
  | string
  | number
  | boolean
  | bigint
  | symbol
  | null
  | undefined;
export type NativeFormValue = string | File;
export type NativeFormBody = Record<
  string,
  NativeFormValue | NativeFormValue[]
>;

/** Native request state replaces Hono Context; response headers remain mutable through middleware unwind. */
export interface NativeRequestContext {
  request: Request;
  path: string;
  params: Record<string, string>;
  readonly headers: Headers;
  response?: Response;
  state: Map<string, NativeStateValue>;
  setHeader: (name: string, value: string) => void;
  get: <T extends NativeStateValue>(key: string) => T | undefined;
  set: <T extends NativeStateValue>(key: string, value: T) => void;
  json: (
    body: Parameters<typeof Response.json>[0],
    status?: number
  ) => Response;
  text: (body: string, status?: number) => Response;
  respond: (response: Response) => Response;
  parseBody: () => Promise<NativeFormBody>;
}

export interface NativeRateLimitStore {
  get?: (
    key: string
  ) =>
    | { totalHits: number; resetTime?: Date }
    | undefined
    | Promise<{ totalHits: number; resetTime?: Date } | undefined>;
  increment: (
    key: string
  ) =>
    | { totalHits: number; resetTime?: Date }
    | Promise<{ totalHits: number; resetTime?: Date }>;
  decrement: (key: string) => void | Promise<void>;
  resetKey: (key: string) => void | Promise<void>;
  resetAll?: () => void | Promise<void>;
  shutdown?: () => void | Promise<void>;
  init?: (options: {
    windowMs: number;
    limit: number;
    standardHeaders: boolean;
    store: NativeRateLimitStore;
  }) => void;
}

export interface NativeRateLimitConfig
  extends Omit<NonNullable<RestConfig["rateLimiting"]>, "store"> {
  store?: NativeRateLimitStore;
}

/** Existing REST capabilities with explicit native callback and custom-store APIs. */
export interface NativeRestConfig
  extends Omit<RestConfig, "cors" | "rateLimiting"> {
  cors?: NativeCorsConfig;
  rateLimiting?: NativeRateLimitConfig;
}

export type NativeHandler = (
  context: NativeRequestContext
) => Response | Promise<Response>;
export type NativeMiddleware = (
  context: NativeRequestContext,
  next: () => Promise<void>
) => undefined | Response | Promise<undefined | Response>;

export interface NativeRestApp {
  fetch: (request: Request) => Response | Promise<Response>;
  route: (method: string, path: string, handler: NativeHandler) => void;
  addMiddleware: (path: string, middleware: NativeMiddleware) => void;
}

export interface CreateNativeRestAppParams {
  lifecycle?: NileLifecycle;
  config: NativeRestConfig;
  engine: Engine;
  nileContext: NileContext;
  services: readonly NativeService[];
  serverName: string;
}

/** Internal compiled route definition shared by native route matchers. */
export interface NativeRoutePattern {
  method: string;
  expression: RegExp;
  names: string[];
  handler: NativeHandler;
}
