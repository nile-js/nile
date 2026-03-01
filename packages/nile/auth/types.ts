import type { Result } from "slang-ts";

/** Where to extract the JWT token from incoming requests */
export type TokenSource = "header" | "cookie";

/**
 * Server-level auth configuration.
 * Kept intentionally lean — only JWT verification via hono/jwt.
 * For custom auth logic (RBAC, API keys, sessions), use onBeforeActionHandler.
 */
export interface AuthConfig {
  /** JWT secret used for token verification */
  secret: string;
  /** Where to look for the token (default: "header") */
  method?: TokenSource;
  /** Cookie name when method is "cookie" (default: "auth_token") */
  cookieName?: string;
  /** Header name when method is "header" (default: "authorization") */
  headerName?: string;
}

/** Successful auth result populated on NileContext after verification */
export interface AuthResult {
  userId: string;
  organizationId: string;
  /** Raw decoded JWT claims for custom logic in hooks */
  claims: Record<string, unknown>;
}

/**
 * Auth context passed to the JWT handler — carries the raw
 * request data needed for token extraction.
 */
export interface AuthContext {
  headers?: Headers;
  cookies?: Record<string, string>;
}

/**
 * Auth handler function signature.
 * Returns Ok(AuthResult) on success, Err(message) on failure.
 */
export type AuthHandler = (
  context: AuthContext,
  config: AuthConfig
) => Promise<Result<AuthResult, string>>;
