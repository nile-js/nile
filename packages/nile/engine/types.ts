import type { Result } from "slang-ts";
import type z from "zod";
import type { AuthConfig, AuthContext } from "@/auth/types";
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
  data: Record<string, unknown>,
  context?: NileContext<unknown>
) => Result<T, E> | Promise<Result<T, E>>;

export interface Action {
  name: string;
  description: string;
  isProtected?: boolean;
  visibility?: {
    rest?: boolean;
    rpc?: boolean;
  };
  isSpecial?: {
    contentType: "multipart/form-data" | "application/json" | "other";
    uploadMode?: "flat" | "structured";
  };
  handler: ActionHandler;
  validation?: z.ZodTypeAny | null;
  hooks?: {
    before?: HookDefinition[];
    after?: HookDefinition[];
  };
  result?: ActionResultConfig;
  accessControl?: string[];
  meta?: Record<string, unknown>; // Generic metadata for any purpose, caching, rate limiting, etc.)
}

export type Actions = Action[];

export interface Service {
  name: string;
  description: string;
  actions: Actions;
  meta?: Record<string, unknown>;
}

export type Services = Service[];

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
}

export interface EngineOptions {
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
  getServices: () => Result<ServiceSummary[], string>;
  getServiceActions: (serviceName: string) => Result<ActionSummary[], string>;
  getAction: (
    serviceName: string,
    actionName: string
  ) => Result<Action, string>;
  executeAction: (
    serviceName: string,
    actionName: string,
    payload: unknown,
    nileContext: NileContext<unknown>,
    authContext?: AuthContext
  ) => Promise<Result<unknown, string>>;
}
