// CORS types — origin control, per-route rules, and resolver functions
export type {
  CorsConfig,
  CorsOptions,
  CorsResolver,
  CorsRouteRule,
} from "./cors/types";
// Engine utilities — action and service factory functions
export { createAction, createActions } from "./engine/create-action";
export { createService, createServices } from "./engine/create-service";
// Engine types — defining services, actions, hooks, and the engine interface
export type {
  Action,
  ActionHandler,
  ActionResultConfig,
  ActionSummary,
  Actions,
  Engine,
  EngineOptions,
  HookContext,
  HookDefinition,
  HookLogEntry,
  Service,
  ServiceSummary,
  Services,
} from "./engine/types";

// Logging — structured log persistence with chunking support
export {
  createLog,
  createLogger,
  getLogs,
  type Log,
  type LogFilter,
  type LoggerConfig,
} from "./logging";
// Server factory — the main entry point for developers
export { createNileServer, getContext } from "./nile/server";
// Nile types — server config, context, request/response, and lifecycle hooks
export type {
  AfterActionHandler,
  BaseContext,
  BeforeActionHandler,
  ExternalRequest,
  ExternalResponse,
  NileContext,
  NileLogger,
  NileServer,
  Resources,
  RPCContext,
  ServerConfig,
  ServerRuntime,
  Sessions,
  WebSocketContext,
} from "./nile/types";
// REST types — REST interface and rate limiting configuration
export type { RateLimitConfig, RestConfig } from "./rest/types";
// Utilities — error handling, diagnostics, and database helpers
export {
  type CursorPage,
  type CursorPaginationOptions,
  createModel,
  createTransactionVariant,
  type DBParams,
  type DBX,
  getZodSchema,
  handleError,
  type ModelOperations,
  type ModelOptions,
  type OffsetPage,
  type OffsetPaginationOptions,
} from "./utils";
