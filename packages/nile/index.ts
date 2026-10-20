// Auth — lean JWT authentication for protected actions
export { verifyJWT } from "./auth/jwt-handler";
export type {
  AuthConfig,
  AuthHandler,
  AuthResult,
  TokenSource,
} from "./auth/types";
// Functional work controls and lifecycle-managed schedules.
export * from "./controls";
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
  EngineStats,
  HookContext,
  HookDefinition,
  HookLogEntry,
  Service,
  ServiceStats,
  ServiceSummary,
  Services,
} from "./engine/types";
export * from "./execution";
export * from "./lifecycle";
// Logging — structured log persistence with chunking support
export {
  createLog,
  createLogger,
  getLogs,
  type Log,
  type LogFilter,
  type LoggerConfig,
} from "./logging";
export * from "./messaging";
export type {
  NativeCorsConfig,
  NativeCorsOptions,
  NativeCorsRouteRule,
  NativeHandler,
  NativeMiddleware,
  NativeRateLimitConfig,
  NativeRateLimitStore,
  NativeRequestContext,
  NativeRestApp,
  NativeRestConfig,
} from "./native";
// Optional Bun-native transport with explicit native request and middleware APIs.
export { createNativeHttpError, createNativeRestApp } from "./native";
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
  NileStats,
  Resources,
  RPCContext,
  ServerConfig,
  ServerRuntime,
  Sessions,
  WebSocketContext,
} from "./nile/types";
export * from "./project";
export type { HttpProtectionOptions } from "./protection/types";
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
export * from "./scheduling";
export { createNileTelemetry } from "./telemetry/lazy";
export type { TelemetryOptions } from "./telemetry/types";
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
export type {
  NileSocket,
  SocketConfig,
  SocketPolicyContext,
} from "./websocket/socket-types";
export type {
  WebSocketConfig,
  WebSocketIdentity,
} from "./websocket/types";
