import type { Result } from "slang-ts";
import type z from "zod";

export interface TopicDefinition {
  schema: z.ZodType;
  scope?: z.ZodType;
}
export type TopicDefinitions = Record<string, TopicDefinition>;
export type InferTopics<T extends TopicDefinitions> = {
  [K in keyof T]: {
    input: z.input<T[K]["schema"]>;
    data: z.output<T[K]["schema"]>;
    scope: T[K] extends { scope: infer S extends z.ZodType }
      ? z.input<S>
      : never;
  };
};
export type TopicInput<T extends TopicDefinitions, K extends keyof T> = {
  topic: K;
  data: z.input<T[K]["schema"]>;
} & (T[K] extends { scope: infer S extends z.ZodType }
  ? { scope: z.input<S> }
  : { scope?: never });
export type TopicSelection<
  T extends TopicDefinitions,
  K extends keyof T,
> = Omit<TopicInput<T, K>, "data">;
export interface Message<
  Topic extends string = string,
  Data = z.output<z.ZodType>,
> {
  id: string;
  topic: Topic;
  data: Data;
  scope?: z.output<z.ZodType>;
  time: string;
}
export interface TopicSubscription {
  unsubscribe: () => void;
}
export interface TopicMessaging<T extends TopicDefinitions = TopicDefinitions> {
  send: <K extends keyof T & string>(
    input: TopicInput<T, K>
  ) => Promise<Result<Message<K, z.output<T[K]["schema"]>>, string>>;
  receive: <K extends keyof T & string>(
    input: TopicSelection<T, K> & {
      onMessage: (
        message: Message<K, z.output<T[K]["schema"]>>
      ) => void | Promise<void>;
    }
  ) => Promise<Result<TopicSubscription, string>>;
  close: () => void;
}
