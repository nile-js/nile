import type { Result } from "slang-ts";
import type z from "zod";
import type {
  AfterActionHandler,
  BeforeActionHandler,
  NileContext,
} from "@/nile/types";

export type HookDefinition = {
  service: string;
  action: string;
  canFail: boolean;
};

export type ActionResultConfig = {
  pipeline: boolean;
};

export type HookLogEntry = {
  name: string;
  input: unknown;
  output: unknown;
  passed: boolean;
};

export type HookContext = {
  actionName: string;
  input: unknown;
  output?: unknown;
  error?: string;
  state: Record<string, unknown>;
  log: {
    before: HookLogEntry[];
    after: HookLogEntry[];
  };
};

export type ActionHandler<T = unknown, E = unknown> = (
  data: Record<string, unknown>,
  context?: NileContext
) => Result<T, E>;

export type Action = {
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
  validation?: z.ZodObject<any> | null;
  hooks?: {
    before?: HookDefinition[];
    after?: HookDefinition[];
  };
  result?: ActionResultConfig;
  accessControl: string[];
  meta?: Record<string, unknown>; // Generic metadata for any purpose, caching, rate limiting, etc.)
};

export type Actions = Action[];

export type Service = {
  name: string;
  description: string;
  actions: Action[];
  meta?: Record<string, unknown>;
};

export type Services = Service[];

export type ServiceSummary = {
  name: string;
  description: string;
  meta?: Record<string, unknown>;
  actions: string[];
};

export type ActionSummary = {
  name: string;
  description: string;
  isProtected: boolean;
  validation: boolean;
  accessControl: string[];
};

export type EngineOptions = {
  diagnostics?: boolean;
  services: Services;
  onBeforeActionHandler?: BeforeActionHandler<unknown, unknown>;
  onAfterActionHandler?: AfterActionHandler<unknown, unknown>;
};
