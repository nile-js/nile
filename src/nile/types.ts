import type { Context as HonoContext } from "hono";
import type { Result } from "slang-ts";
import type { Action, HookContext, Services } from "@/engine/types.js";
import type { RestConfig } from "@/rest/types";

export type WebSocketContext = {
  connection: unknown;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  [key: string]: unknown;
};

export type RPCContext = {
  [key: string]: unknown;
};

export type BaseContext = {
  rest?: HonoContext;
  ws?: WebSocketContext;
  rpc?: RPCContext;
};

export type Sessions = {
  rest?: Record<string, unknown>;
  ws?: Record<string, unknown>;
  rpc?: Record<string, unknown>;
};

export type Resources = {
  logger?: unknown;
  database?: unknown;
  cache?: unknown;
  [key: string]: unknown;
};

export type NileContext = {
  readonly rest?: HonoContext;
  readonly ws?: WebSocketContext;
  readonly rpc?: RPCContext;
  readonly sessions?: Readonly<Sessions>;
  readonly _store: Readonly<Map<string, unknown>>;
  readonly get: <T = unknown>(key: string) => T | undefined;
  readonly set: <T = unknown>(key: string, value: T) => void;
  readonly resources?: Resources;
  hookContext: HookContext;
  updateHookState: (key: string, value: unknown) => void;
  addHookLog: (
    phase: "before" | "after",
    logEntry: { name: string; input: unknown; output: unknown; passed: boolean }
  ) => void;
  setHookError: (error: string) => void;
  setHookOutput: (output: unknown) => void;
  resetHookContext: (actionName: string, input: unknown) => void;
};

export type BeforeActionHandler<T, E> = (params: {
  nileContext: NileContext;
  action: Action;
  payload: unknown;
}) => Result<T, E>;

export type AfterActionHandler<T, E> = (params: {
  nileContext: NileContext;
  action: Action;
  payload: unknown;
  result: Result<T, E>;
}) => Result<T, E>;

export type ServerConfig = {
  serverName: string;
  services?: Services;
  diagnostics?: boolean;
  rest?: RestConfig;
  websocket?: "WSConfig";
  rpc?: "RPCConfig";
  onBeforeActionHandler?: BeforeActionHandler<unknown, unknown>;
  onAfterActionHandler?: AfterActionHandler<unknown, unknown>;
  onBoot?: {
    fn: (context: NileContext) => Promise<void> | void;
    logServices?: boolean;
  };
};

export type ExternalResponse = {
  status: boolean;
  message: string;
  data: {
    error_id?: string;
    [key: string]: unknown;
  };
};

export type ExternalRequest = {
  action: string;
  payload: Record<string, unknown>;
};
