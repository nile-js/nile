import type { Server as NodeServer } from "node:http";
import type { Result } from "slang-ts";
import type z from "zod";
import type { createTopicSchemaReader } from "../messaging/schema";
import type { TopicDefinitions, TopicMessaging } from "../messaging/types";
import type { NileContext } from "../nile/types";
import type { BaseWebSocketConfig, WebSocketIdentity } from "./types";

export type SocketPolicyContext<T extends TopicDefinitions = TopicDefinitions> =
  {
    [K in keyof T & string]: {
      topic: K;
      scope: T[K] extends { scope: infer S extends z.ZodType }
        ? z.output<S>
        : z.output<ReturnType<typeof z.json>> | undefined;
      context: NileContext;
      identity: WebSocketIdentity;
    };
  }[keyof T & string];
export interface SocketConfig<T extends TopicDefinitions = TopicDefinitions>
  extends Omit<BaseWebSocketConfig, "authenticate"> {
  authenticate?: (
    request: Request,
    auth: Record<string, string>
  ) =>
    | Result<WebSocketIdentity, string>
    | Promise<Result<WebSocketIdentity, string>>;
  topics?: T;
  maxSubscriptions?: number;
  authorizeSubscription?(
    input: SocketPolicyContext<T>
  ): Result<boolean, string> | Promise<Result<boolean, string>>;
  authorizePublish?(
    input: SocketPolicyContext<T>
  ): Result<boolean, string> | Promise<Result<boolean, string>>;
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
  bun?: BunSocketHandler;
  idleTimeout: number;
  handleRequest: (
    request: Request,
    server: BunSocketServer
  ) => Promise<Response>;
  attachNode: (server: NodeServer) => Promise<() => Promise<void>>;
  connections: () => number;
}
