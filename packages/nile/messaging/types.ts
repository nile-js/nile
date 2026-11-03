import type { Result } from "slang-ts";
import type z from "zod";

/** The verified identity of a socket connection; undefined for anonymous connections. */
export interface SocketUser {
  userId: string;
  organizationId?: string;
  claims: Record<string, unknown>;
}

type ScopeOutput<S> = S extends z.ZodType ? z.output<S> : undefined;

/** What a topic permission check sees about the connection asking for access. */
export interface TopicAccess<S = z.ZodType | undefined> {
  topic: string;
  scope: ScopeOutput<S>;
  user: SocketUser | undefined;
  connectionId: string;
}

export interface TopicDefinition<
  N extends string = string,
  D extends z.ZodType = z.ZodType,
  S extends z.ZodType | undefined = z.ZodType | undefined,
> {
  name: N;
  data: D;
  scope?: S;
  /** Allow a client to receive this topic. Without it, clients cannot receive. */
  canReceive?(access: TopicAccess<S>): boolean | Promise<boolean>;
  /** Allow a client to send to this topic. Without it, clients cannot send. */
  canSend?(
    access: TopicAccess<S> & { data: z.output<D> }
  ): boolean | Promise<boolean>;
}
export type TopicDefinitions = Record<string, TopicDefinition>;
export type InferTopics<T extends TopicDefinitions> = {
  [K in keyof T]: {
    input: z.input<T[K]["data"]>;
    data: z.output<T[K]["data"]>;
    scope: ScopeInput<T[K]>;
  };
};
type ScopeSchema<D> = D extends { scope?: infer S } ? NonNullable<S> : never;
type HasScope<D> = [ScopeSchema<D>] extends [never] ? false : true;
type ScopeInput<D> =
  ScopeSchema<D> extends infer S extends z.ZodType ? z.input<S> : never;
export type TopicInput<T extends TopicDefinitions, K extends keyof T> = {
  topic: K;
  data: z.input<T[K]["data"]>;
} & (HasScope<T[K]> extends true
  ? { scope: ScopeInput<T[K]> }
  : { scope?: never });
export type TopicSelection<
  T extends TopicDefinitions,
  K extends keyof T,
> = Omit<TopicInput<T, K>, "data">;
/** Server-side receive: leaving out the scope of a scoped topic receives every scope. */
export type ServerTopicSelection<
  T extends TopicDefinitions,
  K extends keyof T,
> = { topic: K } & (HasScope<T[K]> extends true
  ? { scope?: ScopeInput<T[K]> }
  : { scope?: never });
/** Send to a user's open connections, or to one connection, instead of a whole scope. */
export type SocketTarget = { userId: string } | { connectionId: string };
export interface MessageSender {
  connectionId: string;
  userId?: string;
}
export interface Message<
  Topic extends string = string,
  Data = z.output<z.ZodType>,
> {
  id: string;
  topic: Topic;
  data: Data;
  scope?: z.output<z.ZodType>;
  time: string;
  /** Present when a client sent the message; absent for server messages. */
  from?: MessageSender;
}
export interface TopicSubscription {
  unsubscribe: () => void;
}
export interface TopicMessaging<T extends TopicDefinitions = TopicDefinitions> {
  send: <K extends keyof T & string>(
    input: TopicInput<T, K> & { to?: SocketTarget }
  ) => Promise<Result<Message<K, z.output<T[K]["data"]>>, string>>;
  receive: <K extends keyof T & string>(
    input: ServerTopicSelection<T, K> & {
      onMessage: (
        message: Message<K, z.output<T[K]["data"]>>
      ) => void | Promise<void>;
    }
  ) => Promise<Result<TopicSubscription, string>>;
}
