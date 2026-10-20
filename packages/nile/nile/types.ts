import type { Hono, Context as HonoContext } from "hono";
import type { Result } from "slang-ts";
import type { AuthConfig } from "@/auth/types";
import type {
  Action,
  Engine,
  EngineStats,
  HookContext,
  Services,
} from "@/engine/types";
import type { NativeRestApp, NativeRestConfig } from "@/native/types";
import type { RestConfig } from "@/rest/types";
import type {
  ExecutionContext,
  ExecutionOptions,
  InvokeOptions,
} from "../execution/types";
import type { LifecycleResource, NileLifecycle } from "../lifecycle/types";
import type { ProjectOptions } from "../project/types";
import type { NileScheduler, SchedulerOptions } from "../scheduling/types";
import type { NileSocket, SocketConfig } from "../websocket/socket-types";
import type {} from "../websocket/types";
import type { createSchemaExporter } from "./schema";

export interface WebSocketContext {
  connection: unknown;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  [key: string]: unknown;
}

export interface RPCContext {
  [key: string]: unknown;
}

export interface Sessions {
  rest?: Record<string, unknown>;
  ws?: Record<string, unknown>;
  rpc?: { enabled?: boolean };
}

export interface NileLogger {
  flush?: () => void | Promise<void>;
  close?: () => void | Promise<void>;
  info: (input: {
    atFunction: string;
    message: string;
    data?: unknown;
  }) => string;
  warn: (input: {
    atFunction: string;
    message: string;
    data?: unknown;
  }) => string;
  error: (input: {
    atFunction: string;
    message: string;
    data?: unknown;
  }) => string;
}

export interface Resources<TDB = unknown> {
  logger?: NileLogger;
  database?: TDB;
  cache?: unknown;
  [key: string]: unknown;
}

export interface NileContext<TDB = unknown> {
  websocket?: NileSocket;
  /** Current invocation metadata; undefined outside an execution scope. */
  readonly execution?: ExecutionContext;
  /** Global key-value store — intentionally shared across requests */
  readonly _store: Readonly<Map<string, unknown>>;
  /**
   * Retrieves a value by key.
   * For request-scoped keys ("rest", "ws", "rpc") reads from AsyncLocalStorage.
   * For all other keys reads from the global _store.
   */
  readonly get: <T = unknown>(key: string) => T | undefined;
  /** Writes a value to the global key-value store */
  readonly set: <T = unknown>(key: string, value: T) => void;
  readonly resources?: Resources<TDB>;
  /** Retrieve session data for a specific interface — reads from per-request scope */
  getSession: (name: keyof Sessions) => Record<string, unknown> | undefined;
  /** Store session data for a specific interface — writes to per-request scope */
  setSession: (name: keyof Sessions, data: Record<string, unknown>) => void;
  hookContext: HookContext;
  updateHookState: (key: string, value: unknown) => void;
  addHookLog: (
    phase: "before" | "after",
    logEntry: { name: string; input: unknown; output: unknown; passed: boolean }
  ) => void;
  setHookError: (error: string) => void;
  setHookOutput: (output: unknown) => void;
  resetHookContext: (actionName: string, input: unknown) => void;
}

export type BeforeActionHandler<T, E> = (params: {
  nileContext: NileContext<unknown>;
  // biome-ignore lint/suspicious/noExplicitAny: Actions are type-erased at the service boundary — concrete generics are unknown at hook dispatch time
  action: Action<any, any>;
  payload: unknown;
}) => Result<T, E> | Promise<Result<T, E>>;

export type AfterActionHandler<T, E> = (params: {
  nileContext: NileContext<unknown>;
  // biome-ignore lint/suspicious/noExplicitAny: Actions are type-erased at the service boundary — concrete generics are unknown at hook dispatch time
  action: Action<any, any>;
  payload: unknown;
  result: Result<T, E>;
}) => Result<T, E> | Promise<Result<T, E>>;

export type ServerRuntime = "bun" | "node";

interface SharedServerConfig {
  project?: ProjectOptions;
  execution?: ExecutionOptions;
  schedules?: SchedulerOptions;
  cleanup?: LifecycleResource[];
  serverName: string;
  services: Services;
  diagnostics?: boolean;
  /** Print registration table and totals on boot (default: true). Stats remain available when false. */
  logServices?: boolean;
  /** Force creating a new server instance even if one already exists (default: false) */
  forceNewInstance?: boolean;
  resources?: Resources<unknown>;
  /** JWT auth configuration — enables built-in token verification for protected actions */
  auth?: AuthConfig;
  // Independent interfaces share the action engine.
  websocket?: SocketConfig;
  rpc?: { enabled?: boolean };
  onBeforeActionHandler?: BeforeActionHandler<unknown, unknown>;
  onAfterActionHandler?: AfterActionHandler<unknown, unknown>;
  onBoot?: {
    fn: (
      context: NileContext<unknown>
    ) => Promise<Result<null, string>> | Result<null, string>;
    /** Max time in ms to wait for boot before crashing (default: 10000) */
    maxWaitTime?: number;
  };
}

/** Existing applications keep Hono unless Bun native is explicitly selected. */
export type ServerConfig = SharedServerConfig &
  (
    | {
        runtime: "bun";
        /** Use Bun native request, middleware and route APIs. */
        native: true;
        rest?: NativeRestConfig;
      }
    | {
        runtime?: ServerRuntime;
        native?: false;
        rest?: RestConfig;
      }
  );

export interface ExternalResponse {
  status: boolean;
  message: string;
  data: Record<string, unknown>;
}

export interface ExternalRequest {
  intent: "explore" | "execute" | "schema";
  service: string;
  action: string;
  payload: Record<string, unknown>;
}

/** Registration measurements plus framework startup, including the awaited boot hook. */
export type NileStats = EngineStats & { startupDurationMs: number };

export interface NileServer {
  schema: ReturnType<typeof createSchemaExporter>;
  websocket?: NileSocket;
  /** Combined HTTP/socket entry point. Bun supplies its server as the second argument. */
  fetch: (
    request: Request,
    server?: Parameters<NileSocket["handleRequest"]>[1]
  ) => Promise<Response | undefined>;
  invoke: (options: InvokeOptions) => ReturnType<Engine["executeAction"]>;
  lifecycle: NileLifecycle;
  scheduler?: NileScheduler;
  /** Native Bun transport; serve with Bun.serve({ fetch: server.nativeRest.fetch }). */
  nativeRest?: NativeRestApp;
  /** Returns an independent startup snapshot without printing or executing actions. */
  stats: () => NileStats;
  config: ServerConfig;
  engine: Engine;
  context: NileContext<unknown>;
  rest?: {
    app: Hono;
    config: RestConfig;
    /** Register middleware that runs before Nile's services POST handler */
    addMiddleware: (
      path: string,
      fn: (
        c: HonoContext,
        next: () => Promise<void>
      ) => Promise<undefined | Response>
    ) => void;
  };
}
