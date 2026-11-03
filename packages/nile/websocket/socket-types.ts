import type { Server as NodeServer } from "node:http";
import type { Result } from "slang-ts";
import type { createTopicSchemaReader } from "../messaging/schema";
import type {
  SocketUser,
  TopicDefinitions,
  TopicMessaging,
} from "../messaging/types";

export interface SocketHandshake {
  request: Request;
  /** The `auth` object the client sent when it connected. */
  auth: Record<string, string>;
}
export interface SocketConnection {
  connectionId: string;
  user: SocketUser | undefined;
}
export interface SocketLimits {
  /** Default 1000. */
  maxConnections?: number;
  /** Default 5000. */
  authenticationTimeoutMs?: number;
  /** Default 1 MiB. */
  maxMessageBytes?: number;
  /** Default 1 MiB. */
  maxBufferedBytes?: number;
  /** Per connection. Default 32. */
  maxConcurrentMessages?: number;
  /** Per connection. Default 100. */
  maxSubscriptions?: number;
  /** Per connection. Default 600. */
  messagesPerMinute?: number;
}
export interface SocketConfig<T extends TopicDefinitions = TopicDefinitions> {
  topics?: T;
  /** Socket.IO path. Default `/socket.io`. */
  path?: string;
  /** Browser origins are denied unless listed; non-browser clients may omit Origin. */
  allowedOrigins?: string[];
  /**
   * Identify a connection yourself. Without it, Nile verifies the JWT from the
   * server's `auth` config, taking the token from the client's `auth.token`,
   * the auth header or the auth cookie. Return `Ok(undefined)` for an anonymous connection.
   */
  authenticate?: (
    handshake: SocketHandshake
  ) =>
    | Result<SocketUser | undefined, string>
    | Promise<Result<SocketUser | undefined, string>>;
  limits?: SocketLimits;
  onConnect?: (connection: SocketConnection) => void | Promise<void>;
  onDisconnect?: (
    connection: SocketConnection & { reason: string }
  ) => void | Promise<void>;
}
/** Structural runtime boundary keeps Node declarations independent of Bun globals. */
export interface BunSocketServer {
  upgrade: (request: Request, options: { data: never }) => boolean;
  requestIP: (request: Request) => { address: string } | null;
}
export interface BunSocketPeer {
  data: { transport: object };
  readyState: number;
  send: (data: string | Uint8Array) => number;
  close: (code?: number, reason?: string) => void;
}
export interface BunSocketHandler {
  open: (socket: BunSocketPeer) => void;
  message: (socket: BunSocketPeer, message: string | Buffer) => void;
  close: (socket: BunSocketPeer, code: number, reason: string) => void;
  maxPayloadLength: number;
  backpressureLimit: number;
  closeOnBackpressureLimit: boolean;
}
export interface NileSocket<T extends TopicDefinitions = TopicDefinitions>
  extends TopicMessaging<T> {
  schema: ReturnType<typeof createTopicSchemaReader>;
  path: string;
  /** Spread into Bun.serve: `Bun.serve({ fetch: server.fetch, ...server.socket.bun })`. */
  bun?: { websocket: BunSocketHandler; idleTimeout: number };
  handleRequest: (
    request: Request,
    server: BunSocketServer
  ) => Promise<Response>;
  attachNode: (server: NodeServer) => Promise<() => Promise<void>>;
  connections: () => number;
}
