import { verify } from "hono/jwt";
import { Err, Ok, type Result } from "slang-ts";
import type { AuthConfig, AuthContext, AuthResult } from "./types";

/**
 * Extract userId from decoded JWT claims.
 * Supports common field names: userId, id, sub.
 */
function extractUserId(claims: Record<string, unknown>): string | null {
  const value = claims.userId ?? claims.id ?? claims.sub;
  return typeof value === "string" ? value : null;
}

/**
 * Extract organizationId from decoded JWT claims.
 * Supports: organizationId, organization_id, orgId.
 */
function extractOrganizationId(claims: Record<string, unknown>): string | null {
  const value = claims.organizationId ?? claims.organization_id ?? claims.orgId;
  return typeof value === "string" ? value : null;
}

/**
 * Extract Bearer token from Authorization header.
 * Returns Err if header exists but uses wrong scheme.
 */
function extractTokenFromHeader(
  headers: Headers | undefined,
  headerName: string
): Result<string | null, string> {
  if (!headers) {
    return Ok(null);
  }

  const authHeader = headers.get(headerName);
  if (!authHeader) {
    return Ok(null);
  }

  if (!authHeader.startsWith("Bearer ")) {
    return Err("Authorization header must use Bearer scheme");
  }

  return Ok(authHeader.slice(7));
}

/** Extract token from cookies by name */
function extractTokenFromCookie(
  cookies: Record<string, string> | undefined,
  cookieName: string
): string | null {
  if (!cookies) {
    return null;
  }
  return cookies[cookieName] ?? null;
}

/**
 * Extract JWT token from auth context based on configured method.
 * Header method checks Authorization header, cookie method checks named cookie.
 */
function extractToken(
  context: AuthContext,
  config: AuthConfig
): Result<string | null, string> {
  const method = config.method ?? "header";

  if (method === "header") {
    const headerName = config.headerName ?? "authorization";
    return extractTokenFromHeader(context.headers, headerName);
  }

  const cookieName = config.cookieName ?? "auth_token";
  return Ok(extractTokenFromCookie(context.cookies, cookieName));
}

/**
 * Lean JWT authentication handler.
 * Extracts token from header or cookie, verifies via hono/jwt,
 * and returns AuthResult with userId, organizationId, and raw claims.
 *
 * For anything beyond JWT (RBAC, API keys, sessions), use onBeforeActionHandler.
 */
export async function verifyJWT(
  context: AuthContext,
  config: AuthConfig
): Promise<Result<AuthResult, string>> {
  const tokenResult = extractToken(context, config);

  if (tokenResult.isErr) {
    return Err(tokenResult.error);
  }

  const token = tokenResult.value;
  if (!token) {
    return Err(`No JWT token found in ${config.method ?? "header"}`);
  }

  try {
    const claims = await verify(
      token,
      config.secret,
      config.algorithm ?? "HS256"
    );

    if (!claims) {
      return Err("Invalid JWT token");
    }

    const userId = extractUserId(claims as Record<string, unknown>);
    const organizationId = extractOrganizationId(
      claims as Record<string, unknown>
    );

    if (!(userId && organizationId)) {
      return Err("Missing userId or organizationId in JWT token");
    }

    return Ok({
      userId,
      organizationId,
      claims: claims as Record<string, unknown>,
    });
  } catch (error) {
    return Err(describeJwtFailure(error));
  }
}

/**
 * Hono's JWT errors put the raw token, header or payload in their messages. Those
 * messages reach responses and logs, so report a fixed reason chosen by error name.
 */
const JWT_FAILURE_REASONS: Record<string, string> = {
  JwtTokenExpired: "token expired",
  JwtTokenNotBefore: "token is not valid yet",
  JwtTokenIssuedAt: "token issue time is invalid",
  JwtTokenIssuer: "token issuer is not accepted",
  JwtTokenAudience: "token audience is not accepted",
  JwtPayloadRequiresAud: "token audience is not accepted",
  JwtAlgorithmMismatch: "token algorithm is not accepted",
  JwtAlgorithmNotAllowed: "token algorithm is not accepted",
  JwtAlgorithmNotImplemented: "token algorithm is not accepted",
};

/** A safe failure message that never contains token, header or claim data. */
function describeJwtFailure(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  const reason = JWT_FAILURE_REASONS[name] ?? "invalid token";
  return `JWT authentication failed: ${reason}`;
}
