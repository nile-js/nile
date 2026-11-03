import { Err, Ok, type Result, safeTry } from "slang-ts";
import z from "zod";
import type {
  Message,
  MessageSender,
  SocketTarget,
  TopicDefinitions,
  TopicMessaging,
} from "./types";
import {
  type publicationSchema,
  type selectionSchema,
  validateSelection,
} from "./validation";

type Json = z.output<ReturnType<typeof z.json>>;
interface Listener {
  onMessage: (message: Message) => void | Promise<void>;
  connectionId?: string;
  userId?: string;
}
interface Selected {
  topic: string;
  scope: Json | undefined;
  key: string;
}
export interface SendOptions {
  to?: SocketTarget;
  from?: MessageSender;
  /** Runs after the data is validated and before delivery; a client send uses it for `canSend`. */
  authorize?: (selected: Selected, data: Json) => Promise<Result<true, string>>;
}
export interface ReceiveOptions {
  connectionId?: string;
  userId?: string;
  /** Receive a scoped topic across every scope; only server code may ask for this. */
  everyScope?: boolean;
}

const targetSchema = z.union([
  z.object({ userId: z.string().min(1).max(256) }).strict(),
  z.object({ connectionId: z.string().min(1).max(256) }).strict(),
]);

const matchesTarget = (listener: Listener, to: SocketTarget | undefined) => {
  if (!to) {
    return true;
  }
  return "userId" in to
    ? listener.userId === to.userId
    : listener.connectionId === to.connectionId;
};

/** Isolate pub/sub per server, validate at admission, and contain subscriber failures. */
export function createTopicMessaging<T extends TopicDefinitions>(topics: T) {
  const listeners = new Map<string, Set<Listener>>();
  const everyScope = new Map<string, Set<Listener>>();
  let closed = false;
  const validate = (input: z.input<typeof selectionSchema>) =>
    validateSelection(topics, input);
  const add = (
    groups: Map<string, Set<Listener>>,
    key: string,
    item: Listener
  ) => {
    const group = groups.get(key) ?? new Set<Listener>();
    groups.set(key, group);
    group.add(item);
    return () => {
      group.delete(item);
      if (!group.size && groups.get(key) === group) {
        groups.delete(key);
      }
    };
  };
  /** Validate the target, scope and data; the data is parsed exactly once. */
  const prepare = async (
    input: z.input<typeof publicationSchema>,
    to: SocketTarget | undefined
  ): Promise<Result<{ selected: Selected; data: Json }, string>> => {
    if (to !== undefined && !targetSchema.safeParse(to).success) {
      return Err("Invalid message target");
    }
    const selected = await validate(input);
    if (selected.isErr) {
      return selected;
    }
    const definition = topics[input.topic];
    if (!definition) {
      return Err("Unknown topic");
    }
    const parsed = await safeTry(() => definition.data.parseAsync(input.data));
    if (parsed.isErr) {
      return Err("Invalid topic data");
    }
    const data = z.json().safeParse(parsed.value);
    if (!data.success) {
      return Err("Topic data must be JSON serializable");
    }
    return Ok({ selected: selected.value, data: data.data });
  };
  const deliver = (message: Message, key: string, to?: SocketTarget) => {
    const targets = [
      ...(listeners.get(key) ?? []),
      // Server listeners across every scope see broadcasts, not messages aimed at one user or connection.
      ...(to ? [] : (everyScope.get(message.topic) ?? [])),
    ];
    // Acceptance never waits for user listeners or claims that every subscriber processed the message.
    for (const listener of targets) {
      if (matchesTarget(listener, to)) {
        safeTry(() => listener.onMessage(structuredClone(message)));
      }
    }
  };
  const send = async (
    input: z.input<typeof publicationSchema>,
    options: SendOptions = {}
  ): Promise<Result<Message, string>> => {
    if (closed) {
      return Err("Topic messaging is closed");
    }
    const prepared = await prepare(input, options.to);
    if (prepared.isErr) {
      return Err(prepared.error);
    }
    const { selected, data } = prepared.value;
    if (options.authorize) {
      const allowed = await options.authorize(selected, data);
      if (allowed.isErr) {
        return Err(allowed.error);
      }
    }
    if (closed) {
      return Err("Topic messaging is closed");
    }
    const message: Message = {
      id: crypto.randomUUID(),
      topic: input.topic,
      data,
      scope: selected.scope,
      time: new Date().toISOString(),
      ...(options.from ? { from: { ...options.from } } : {}),
    };
    deliver(message, selected.key, options.to);
    return Ok(message);
  };
  const receive = async (
    input: z.input<typeof selectionSchema> & {
      onMessage: Listener["onMessage"];
    },
    options: ReceiveOptions = {}
  ) => {
    if (closed) {
      return Err("Topic messaging is closed");
    }
    const listener: Listener = {
      onMessage: input.onMessage,
      connectionId: options.connectionId,
      userId: options.userId,
    };
    const definition = Object.hasOwn(topics, input.topic)
      ? topics[input.topic]
      : undefined;
    if (options.everyScope && definition?.scope && input.scope === undefined) {
      return Ok({ unsubscribe: add(everyScope, input.topic, listener) });
    }
    const selected = await validate(input);
    if (selected.isErr) {
      return selected;
    }
    if (closed) {
      return Err("Topic messaging is closed");
    }
    return Ok({ unsubscribe: add(listeners, selected.value.key, listener) });
  };
  const close = () => {
    closed = true;
    listeners.clear();
    everyScope.clear();
  };
  // The validated boundary restores each registry member's input/output relationship.
  const api = {
    send: ({
      to,
      ...input
    }: z.input<typeof publicationSchema> & { to?: SocketTarget }) =>
      send(input, { to }),
    receive: (
      input: z.input<typeof selectionSchema> & {
        onMessage: Listener["onMessage"];
      }
    ) => receive(input, { everyScope: true }),
  } as unknown as TopicMessaging<T>;
  return { api, send, receive, validate, close };
}
