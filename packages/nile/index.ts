// Auth — lean JWT authentication for protected actions
export { verifyJWT } from "./auth/jwt-handler";
export type {
  AuthConfig,
  AuthHandler,
  AuthResult,
  TokenSource,
} from "./auth/types";
// CORS types — origin control, per-route rules, and resolver functions
export type {
  CorsConfig,
  CorsHelper,
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
export type { RequestStore } from "./nile/request-scope";
// Request scope — per-request isolation via AsyncLocalStorage
export { getRequestStore, runInRequestScope } from "./nile/request-scope";
// Server factory — the main entry point for developers
export { createNileServer, getContext } from "./nile/server";
// Nile types — server config, context, request/response, and lifecycle hooks
export type {
  AfterActionHandler,
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
export type { RestApp } from "./rest/rest";
// REST types — REST interface and rate limiting configuration
export type {
  DiscoveryConfig,
  MiddlewareEntry,
  RateLimitConfig,
  RestConfig,
} from "./rest/types";
export type {
  FormDataResult,
  StructuredPayload,
  UploadAllowlist,
  UploadLimits,
  UploadsConfig,
  UploadValidationResult,
} from "./rest/uploads";
// Uploads — multipart form-data parsing and validation
export {
  detectMimeType,
  handleFormDataRequest,
  validateFiles,
} from "./rest/uploads";
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
