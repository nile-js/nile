import { Err, Ok, type Result } from "slang-ts";
import { verifyJWT } from "../auth/jwt-handler";
import type { AuthConfig } from "../auth/types";
import type { SocketUser } from "../messaging/types";
import type { SocketHandshake } from "./socket-types";

const COOKIE_SEPARATOR = /;\s*/;

function parseCookies(header: string | null): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of header?.split(COOKIE_SEPARATOR) ?? []) {
    const index = part.indexOf("=");
    if (index > 0) {
      const value = part.slice(index + 1);
      try {
        cookies[part.slice(0, index)] = decodeURIComponent(value);
      } catch {
        cookies[part.slice(0, index)] = value;
      }
    }
  }
  return cookies;
}

/**
 * Verify a connection with the server's JWT config. A connection without any
 * token is anonymous; a token that is present but invalid refuses the connection.
 */
export async function authenticateWithJwt(
  handshake: SocketHandshake,
  config: AuthConfig | undefined
): Promise<Result<SocketUser | undefined, string>> {
  if (!config) {
    return Ok(undefined);
  }
  const headerName = config.headerName ?? "authorization";
  const cookieName = config.cookieName ?? "auth_token";
  const headers = new Headers(handshake.request.headers);
  const cookies = parseCookies(headers.get("cookie"));
  const token = handshake.auth.token;
  if (token) {
    headers.set(headerName, `Bearer ${token}`);
    cookies[cookieName] = token;
  }
  const hasToken =
    (config.method ?? "header") === "header"
      ? headers.has(headerName)
      : Boolean(cookies[cookieName]);
  if (!hasToken) {
    return Ok(undefined);
  }
  const verified = await verifyJWT({ headers, cookies }, config);
  if (verified.isErr) {
    return Err(verified.error);
  }
  return Ok(verified.value);
}

/** JWT `exp` is in seconds; a missing or malformed claim means no expiry. */
export function expiryOf(user: SocketUser | undefined): number | undefined {
  const exp = user?.claims.exp;
  return typeof exp === "number" && Number.isFinite(exp)
    ? exp * 1000
    : undefined;
}
