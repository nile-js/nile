import type { RestConfig } from "./types";

/** Gate discovery before exposing service metadata. */
export function checkDiscoveryAccess(
  intent: string,
  payload: Record<string, unknown> | undefined,
  config: RestConfig
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
