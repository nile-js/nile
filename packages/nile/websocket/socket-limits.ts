import type { SocketConfig } from "./socket-types";

/** Validate bounded per-connection resources before accepting any socket traffic. */
export function resolveSocketLimits(config: SocketConfig) {
  const limits = config.limits ?? {};
  const bounds = {
    connections: limits.maxConnections ?? 1000,
    authMs: limits.authenticationTimeoutMs ?? 5000,
    bytes: limits.maxMessageBytes ?? 1024 * 1024,
    concurrent: limits.maxConcurrentMessages ?? 32,
    subscriptions: limits.maxSubscriptions ?? 100,
    buffered: limits.maxBufferedBytes ?? 1024 * 1024,
    perMinute: limits.messagesPerMinute ?? 600,
  };
  for (const value of Object.values(bounds)) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error("Socket limits must be positive integers");
    }
  }
  return bounds;
}
