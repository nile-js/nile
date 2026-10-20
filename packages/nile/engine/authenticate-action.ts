import { parse as parseCookies } from "hono/utils/cookie";
import { Err, Ok, type Result } from "slang-ts";
import { verifyJWT } from "@/auth/jwt-handler";
import type { AuthConfig } from "@/auth/types";
import type { NativeRequestContext } from "@/native/types";
import type { NileContext } from "@/nile/types";
import { getRequestStore } from "../nile/request-scope";
import type { Action } from "./types";

/**
 * Verify JWT for a protected action. Extracts credentials from the per-request
 * transport context (via AsyncLocalStorage) and writes the verified identity to the
 * store via setSession("rest", ...).
 *
 * Returns Ok(void) on success or skip, Err(message) if auth is required but fails.
 */
export async function authenticateAction(
  action: Action,
  auth: AuthConfig | undefined,
  nileContext: NileContext<unknown>,
  serviceName: string,
  actionName: string,
  log: (msg: string) => void
): Promise<Result<void, string>> {
  if (!(action.isProtected && auth)) {
    return Ok(undefined);
  }

  // Both transports retain their request-local credentials and shared session semantics.
  const honoCtx = nileContext.get<import("hono").Context>("rest");
  const native = nileContext.get<NativeRequestContext>("nativeRest");
  const credentials = getRequestStore()?.credentials;
  if (!(honoCtx || native || credentials)) {
    return Err("Authentication required: no request context available");
  }

  const headers =
    credentials?.headers ?? native?.request.headers ?? honoCtx?.req.raw.headers;
  const authContext = {
    headers,
    // Header authentication never needs cookie parsing or cookie-header access.
    cookies:
      auth.method === "cookie"
        ? (credentials?.cookies ?? parseCookies(headers?.get("Cookie") ?? ""))
        : undefined,
  };

  const authResult = await verifyJWT(authContext, auth);
  if (authResult.isErr) {
    log(`Auth failed for ${serviceName}.${actionName}: ${authResult.error}`);
    return Err(authResult.error);
  }

  // Write verified identity to the session store — single source of truth
  nileContext.setSession("rest", {
    userId: authResult.value.userId,
    organizationId: authResult.value.organizationId,
    ...authResult.value.claims,
  });

  log(
    `Auth OK for ${serviceName}.${actionName} (user: ${authResult.value.userId})`
  );
  return Ok(undefined);
}
