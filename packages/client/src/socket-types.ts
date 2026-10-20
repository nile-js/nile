import type { ClientResult } from "./types.js";

export interface TopicContract {
  data: object | string | number | boolean | null;
  input?: object | string | number | boolean | null;
  scope?: object | string | number | boolean | null;
}
export type TopicShape<T> = { [K in keyof T]: TopicContract };
export type ActionShape<A> = { [S in keyof A]: { [K in keyof A[S]]: object } };
export type SocketTopics = Record<string, TopicContract>;
export type SocketActions = Record<string, Record<string, object>>;
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
  scope?: object | string | number | boolean | null;
  time: string;
}
export interface NileSocketClientConfig {
  baseUrl: string;
  path?: string;
  timeout?: number;
  auth?:
    | Record<string, string>
    | (() => Record<string, string> | Promise<Record<string, string>>);
  onSubscriptionError?: (input: { topic: string; error: string }) => void;
}
export interface NileSocketClient<
  A extends ActionShape<A>,
  T extends TopicShape<T>,
> {
  invoke: <S extends keyof A & string, K extends keyof A[S] & string>(input: {
    service: S;
    action: K;
    payload: A[S][K];
  }) => Promise<ClientResult>;
  send: <K extends keyof T & string>(
    input: SocketPublication<T, K>
  ) => Promise<ClientResult<SocketMessage<K, T[K]["data"]>>>;
  receive: <K extends keyof T & string>(
    input: SocketSelection<T, K> & {
      onMessage: (message: SocketMessage<K, T[K]["data"]>) => void;
    }
  ) => Promise<
    ClientResult<{
      unsubscribe: () => Promise<ClientResult<{ subscribed: boolean }>>;
    }>
  >;
  close: () => void;
}
