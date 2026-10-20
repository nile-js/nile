import { Err, Ok, safeTry } from "slang-ts";
import z from "zod";
import type { Message, TopicDefinitions, TopicMessaging } from "./types";
import {
  type publicationSchema,
  type selectionSchema,
  validateSelection,
} from "./validation";

type Listener = (message: Message) => void | Promise<void>;

/** Isolate pub/sub per server, validate at admission, and contain subscriber failures. */
export function createTopicMessaging<T extends TopicDefinitions>(topics: T) {
  const listeners = new Map<string, Set<Listener>>();
  let closed = false;
  const validate = (input: z.input<typeof selectionSchema>) =>
    validateSelection(topics, input);
  const send = async (input: z.input<typeof publicationSchema>) => {
    if (closed) {
      return Err("Topic messaging is closed");
    }
    const selected = await validate(input);
    if (selected.isErr) {
      return selected;
    }
    const definition = topics[input.topic];
    if (!definition) {
      return Err("Unknown topic");
    }
    const parsed = await safeTry(() =>
      definition.schema.parseAsync(input.data)
    );
    if (parsed.isErr) {
      return Err("Invalid topic data");
    }
    const data = z.json().safeParse(parsed.value);
    if (!data.success) {
      return Err("Topic data must be JSON serializable");
    }
    if (closed) {
      return Err("Topic messaging is closed");
    }
    const message: Message = {
      id: crypto.randomUUID(),
      topic: input.topic,
      data: data.data,
      scope: selected.value.scope,
      time: new Date().toISOString(),
    };
    // Acceptance never waits for user listeners or claims that every subscriber processed the message.
    for (const listener of listeners.get(selected.value.key) ?? []) {
      safeTry(() => listener(structuredClone(message)));
    }
    return Ok(message);
  };
  const receive = async (
    input: z.input<typeof selectionSchema> & { onMessage: Listener }
  ) => {
    if (closed) {
      return Err("Topic messaging is closed");
    }
    const selected = await validate(input);
    if (selected.isErr) {
      return selected;
    }
    if (closed) {
      return Err("Topic messaging is closed");
    }
    const group = listeners.get(selected.value.key) ?? new Set<Listener>();
    listeners.set(selected.value.key, group);
    group.add(input.onMessage);
    return Ok({
      unsubscribe: () => {
        group.delete(input.onMessage);
        if (!group.size) {
          listeners.delete(selected.value.key);
        }
      },
    });
  };
  const close = () => {
    closed = true;
    listeners.clear();
  };
  // The validated boundary restores each registry member's input/output relationship.
  const api = { send, receive, close } as TopicMessaging<T>;
  return { api, send, receive, validate, close };
}
