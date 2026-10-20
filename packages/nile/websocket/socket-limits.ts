import type { SocketConfig } from "./socket-types";

/** Validate bounded per-connection resources before accepting any socket traffic. */
export function resolveSocketLimits(config: SocketConfig) {
  const bounds = {
    connections: config.maxConnections ?? 1000,
    authMs: config.authenticationTimeoutMs ?? 5000,
    bytes: config.maxMessageBytes ?? 1024 * 1024,
    concurrent: config.maxConcurrentMessages ?? 32,
    subscriptions: config.maxSubscriptions ?? 100,
    buffered: config.maxBufferedBytes ?? 1024 * 1024,
    perMinute: config.messagesPerMinute ?? 600,
  };
  for (const value of Object.values(bounds)) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error("Socket limits must be positive integers");
    }
  }
  return bounds;
}
