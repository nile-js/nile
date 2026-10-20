import type { Result } from "slang-ts";
import type { InvokeOptions } from "../execution/types";

export interface WebSocketIdentity {
  /** Expiry is checked on every message; clients reconnect to refresh credentials. */
  expiresAt?: number;
  session?: NonNullable<InvokeOptions["session"]>;
  credentials?: InvokeOptions["credentials"];
  clientKey?: string;
}
export interface BaseWebSocketConfig {
  path?: string;
  /** Browser origins are denied unless explicitly allowed; non-browser clients may omit Origin. */
  allowedOrigins?: string[];
  authenticate?: (
    request: Request
  ) =>
    | Result<WebSocketIdentity, string>
    | Promise<Result<WebSocketIdentity, string>>;
  maxConnections?: number;
  authenticationTimeoutMs?: number;
  maxMessageBytes?: number;
  maxConcurrentMessages?: number;
  maxBufferedBytes?: number;
  messagesPerMinute?: number;
}

export type { SocketConfig as WebSocketConfig } from "./socket-types";
