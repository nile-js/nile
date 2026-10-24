import type { Result } from "slang-ts";
import type z from "zod";
import type { AuthConfig } from "@/auth/types";
import type { CorsOptions } from "@/cors/types";
/**
 * Circular `import type` with @/nile/types is intentional and safe —
 * type imports are erased at compile time and produce no runtime dependency.
 * Engine needs NileContext for ActionHandler; Nile needs Action/Engine/HookContext for its types.
 */
import type {
  AfterActionHandler,
  BeforeActionHandler,
  NileContext,
} from "@/nile/types";

export interface HookDefinition {
  service: string;
  action: string;
  /** When true, hook failure stops the pipeline. Non-critical hooks log errors but continue. */
  isCritical: boolean;
}

export interface ActionResultConfig {
  pipeline: boolean;
}

export interface HookLogEntry {
  name: string;
  input: unknown;
  output: unknown;
  passed: boolean;
}

export interface HookContext {
  actionName: string;
  input: unknown;
  output?: unknown;
  error?: string;
  state: Record<string, unknown>;
  log: {
    before: HookLogEntry[];
    after: HookLogEntry[];
  };
}

export type ActionHandler<T = unknown, E = string> = (
  data: T,
  context?: NileContext<unknown>
) => Result<unknown, E> | Promise<Result<unknown, E>>;

export interface Action<T = unknown, E = string> {
  /** Inherit endpoint CORS by default; false skips response headers; options override global defaults.
   * Shared endpoint preflight remains global. Global CORS disabled takes precedence.
   */
  cors?: boolean | CorsOptions;
  name: string;
  description: string;
  /** Response message for a successful call. A handler's `Ok(value, message)` takes precedence. */
  successMessage?: string;
  isProtected?: boolean;
  visibility?: {
    rest?: boolean;
    rpc?: boolean;
    ws?: boolean;
  };
  isSpecial?: {
    contentType: "multipart/form-data" | "application/json" | "other";
    uploadMode?: "flat" | "structured";
  };
  handler: ActionHandler<T, E>;
  validation?: z.ZodTypeAny | null;
  /** Cache this action's JSON discovery conversion lazily (default: true). False keeps it dynamic. */
  cacheSchema?: boolean;
  hooks?: {
    before?: HookDefinition[];
    after?: HookDefinition[];
  };
  result?: ActionResultConfig;
  accessControl?: string[];
  meta?: Record<string, unknown>; // Generic metadata for any purpose, caching, rate limiting, etc.)
}

/**
 * Heterogeneous collection of actions with varying T types.
 * Uses `any` at the collection boundary since TypeScript lacks existential types.
 * Individual actions retain full type safety via `createAction<T>()`.
 */
// biome-ignore lint/suspicious/noExplicitAny: Collection boundary for heterogeneous action types
export type Actions = Action<any, any>[];

export interface Service {
  name: string;
  description: string;
  actions: Actions;
  meta?: Record<string, unknown>;
}

export type Services = Service[];

/** Registration work measured after service definitions have been constructed. */
export interface ServiceStats {
  name: string;
  description: string;
  actionCount: number;
  registrationDurationMs: number;
}

/** Startup registration snapshot, independent of later configuration changes. */
export interface EngineStats {
  totalServices: number;
  totalActions: number;
  registrationDurationMs: number;
  services: ServiceStats[];
}

export interface ServiceSummary {
  name: string;
  description: string;
  meta?: Record<string, unknown>;
  actions: string[];
}

export interface ActionSummary {
  name: string;
  description: string;
  isProtected: boolean;
  validation: boolean;
  accessControl: string[];
  visibility?: { rest?: boolean; rpc?: boolean };
}

export interface EngineOptions {
  /** Internal execution boundary shared by every transport; absent keeps the standalone engine lightweight. */
  execute?: (
    service: string,
    action: string,
    run: () => ReturnType<Engine["executeAction"]>
  ) => ReturnType<Engine["executeAction"]>;
  checkQuota?: (
    service: string,
    action: string
  ) => Promise<Result<void, string>>;
  diagnostics?: boolean;
  /** Optional logger from resources — used for diagnostics output when available */
  logger?:
    | { info: (msg: string, data?: unknown) => void }
    | import("@/nile/types").NileLogger;
  services: Services;
  /** JWT auth configuration — when provided, protected actions require valid tokens */
  auth?: AuthConfig;
  onBeforeActionHandler?: BeforeActionHandler<unknown, unknown>;
  onAfterActionHandler?: AfterActionHandler<unknown, unknown>;
}

/** Formalized return type of createEngine */
export interface Engine {
  /** Returns a copy so callers cannot alter the recorded startup measurements. */
  stats: () => EngineStats;
  getServices: () => Result<ServiceSummary[], string>;
  getServiceActions: (serviceName: string) => Result<ActionSummary[], string>;
  getAction: (
    serviceName: string,
    actionName: string
    // biome-ignore lint/suspicious/noExplicitAny: Actions are type-erased at the service boundary — concrete generics are unknown at lookup time
  ) => Result<Action<any, any>, string>;
  executeAction: (
    serviceName: string,
    actionName: string,
    payload: unknown,
    nileContext: NileContext<unknown>
  ) => Promise<Result<unknown, string>>;
}
