import type { ClientResult } from "./types.js";

type WireJson = object | string | number | boolean | null;

export interface TopicContract {
  data: WireJson;
  input?: WireJson;
  scope?: WireJson;
}
export type TopicShape<T> = { [K in keyof T]: TopicContract };
export type SocketTopics = Record<string, TopicContract>;
export type SocketSelection<T, K extends keyof T> = {
  topic: K;
} & (T[K] extends { scope: infer S }
  ? [S] extends [never]
    ? { scope?: never }
    : { scope: S }
  : { scope?: never });
export type SocketPublication<T, K extends keyof T> = SocketSelection<T, K> & {
  data: T[K] extends { input: infer I }
    ? I
    : T[K] extends { data: infer D }
      ? D
      : T[K];
};
export interface SocketMessage<K extends string, D> {
  id: string;
  topic: K;
  data: D;
  scope?: WireJson;
  time: string;
  /** Present when a client sent the message; absent for server messages. */
  from?: { connectionId: string; userId?: string };
}
export interface NileSocketConfig {
  /** Socket server origin when it differs from `baseUrl`. Defaults to the origin of `baseUrl`. */
  url?: string;
  /** Socket.IO path. Default `/socket.io`; must match the server. */
  path?: string;
  /** Connection and acknowledgement timeout in ms. Default 30000. */
  timeout?: number;
  /** Sent when connecting, e.g. `{ token }`. A function is called again on every reconnect. */
  auth?:
    | Record<string, string>
    | (() => Record<string, string> | Promise<Record<string, string>>);
  onConnect?: () => void;
  onDisconnect?: (reason: string) => void;
  /** Fires after a reconnect once active subscriptions are restored. */
  onReconnect?: () => void;
  /** A connection failure, or a subscription refused while restoring it after a reconnect. */
  onError?: (error: { error: string; topic?: string }) => void;
}
export interface SocketSubscription {
  topic: string;
  /** Stop this listener; the server subscription ends when the last listener for it stops. */
  unsubscribe: () => Promise<ClientResult<{ subscribed: boolean }>>;
}
export interface NileSocketClient<T extends TopicShape<T> = SocketTopics> {
  /** Send to a topic; the server checks the topic's `canSend` and validates the data. */
  send: <K extends keyof T & string>(
    input: SocketPublication<T, K>
  ) => Promise<ClientResult<SocketMessage<K, T[K]["data"]>>>;
  /** Subscribe to a topic and listen for its messages in one call. */
  receive: <K extends keyof T & string>(
    input: SocketSelection<T, K> & {
      onMessage: (message: SocketMessage<K, T[K]["data"]>) => void;
    }
  ) => Promise<ClientResult<SocketSubscription>>;
  /** Disconnect and drop every listener. The client cannot reconnect afterwards. */
  close: () => void;
}
