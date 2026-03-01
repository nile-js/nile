import type { Hono, Context as HonoContext } from "hono";
import type { Result } from "slang-ts";
import type { AuthConfig, AuthResult } from "@/auth/types";
import type { Action, Engine, HookContext, Services } from "@/engine/types";
import type { RestConfig } from "@/rest/types";

export interface WebSocketContext {
  connection: unknown;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  [key: string]: unknown;
}

export interface RPCContext {
  [key: string]: unknown;
}

export interface BaseContext {
  rest?: HonoContext;
  ws?: WebSocketContext;
  rpc?: RPCContext;
}

export interface Sessions {
  rest?: Record<string, unknown>;
  ws?: Record<string, unknown>;
  rpc?: Record<string, unknown>;
}

export interface Sessions {
  rest?: Record<string, unknown>;
  ws?: Record<string, unknown>;
  rpc?: Record<string, unknown>;
}

export interface NileLogger {
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
  readonly rest?: HonoContext;
  readonly ws?: WebSocketContext;
  readonly rpc?: RPCContext;
  sessions: Sessions;
  readonly _store: Readonly<Map<string, unknown>>;
  readonly get: <T = unknown>(key: string) => T | undefined;
  readonly set: <T = unknown>(key: string, value: T) => void;
  readonly resources?: Resources<TDB>;
  /** Retrieve session data for a specific interface */
  getSession: (name: keyof Sessions) => Record<string, unknown> | undefined;
  /** Store session data for a specific interface */
  setSession: (name: keyof Sessions, data: Record<string, unknown>) => void;
  /** Auth result populated after successful JWT verification */
  authResult?: AuthResult;
  /** Get the raw auth result after JWT verification */
  getAuth: () => AuthResult | undefined;
  /** Get authenticated user identity (userId + organizationId) */
  getUser: () =>
    | { userId: string; organizationId: string; [key: string]: unknown }
    | undefined;
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
  action: Action;
  payload: unknown;
}) => Result<T, E>;

export type AfterActionHandler<T, E> = (params: {
  nileContext: NileContext<unknown>;
  action: Action;
  payload: unknown;
  result: Result<T, E>;
}) => Result<T, E>;

export type ServerRuntime = "bun" | "node";

export interface ServerConfig {
  serverName: string;
  runtime?: ServerRuntime;
  services: Services;
  diagnostics?: boolean;
  /** Print registered services table to console on boot (default: true) */
  logServices?: boolean;
  resources?: Resources<unknown>;
  /** JWT auth configuration — enables built-in token verification for protected actions */
  auth?: AuthConfig;
  rest?: RestConfig;
  // websocket and rpc interfaces — types TBD when implemented
  websocket?: Record<string, unknown>;
  rpc?: Record<string, unknown>;
  onBeforeActionHandler?: BeforeActionHandler<unknown, unknown>;
  onAfterActionHandler?: AfterActionHandler<unknown, unknown>;
  onBoot?: {
    fn: (context: NileContext<unknown>) => Promise<void> | void;
  };
}

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

export interface NileServer {
  config: ServerConfig;
  engine: Engine;
  context: NileContext<unknown>;
  rest?: { app: Hono; config: RestConfig };
}
