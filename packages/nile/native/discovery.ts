import type { ExternalRequest } from "../nile/types";
import { createRestIntentHandlers } from "../rest/schema-cache";
import type { NativeRestConfig } from "./types";

/** Share Nile's lazy schema conversion cache without depending on a Hono request. */
export function createNativeIntentHandlers({
  config,
}: {
  config: NativeRestConfig;
}) {
  return createRestIntentHandlers({ config });
}

/** Authorize discovery before accessing metadata or triggering schema conversion. */
export function checkNativeDiscoveryAccess(
  intent: string,
  payload: ExternalRequest["payload"] | undefined,
  config: Pick<NativeRestConfig, "discovery">
): { allowed: boolean; message?: string } {
  if (intent !== "explore" && intent !== "schema") {
    return { allowed: true };
  }
  if (!config.discovery?.enabled) {
    return { allowed: false, message: "API discovery is disabled" };
  }
  if (
    config.discovery.secret &&
    payload?.discoverySecret !== config.discovery.secret
  ) {
    return { allowed: false, message: "Invalid or missing discovery secret" };
  }
  return { allowed: true };
}
