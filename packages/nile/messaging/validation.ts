import { Err, Ok, safeTry } from "slang-ts";
import z from "zod";
import type { TopicDefinitions } from "./types";

export const selectionSchema = z.object({
  topic: z.string().min(1).max(256),
  scope: z.json().optional(),
});
export const publicationSchema = selectionSchema.extend({ data: z.json() });

/** Canonical JSON identity prevents object key order from changing a topic's scope. */
export function encodeScope(
  value: z.output<ReturnType<typeof z.json>> | undefined
): string {
  if (value === undefined) {
    return "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(encodeScope).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${encodeScope(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Validate scope before resolving an internal room; never accept arbitrary room names. */
export async function validateSelection(
  topics: TopicDefinitions,
  input: z.input<typeof selectionSchema>
) {
  const definition = Object.hasOwn(topics, input.topic)
    ? topics[input.topic]
    : undefined;
  if (!definition) {
    return Err("Unknown topic");
  }
  if (!definition.scope && input.scope !== undefined) {
    return Err("Topic does not accept a scope");
  }
  const parsed = await safeTry(() => definition.scope?.parseAsync(input.scope));
  if (parsed.isErr) {
    return Err("Invalid topic scope");
  }
  const serializable = z.json().safeParse(parsed.value ?? null);
  if (!serializable.success) {
    return Err("Topic scope must be JSON serializable");
  }
  const scope = definition.scope ? serializable.data : undefined;
  return Ok({
    topic: input.topic,
    scope,
    key: JSON.stringify([input.topic, encodeScope(scope)]),
  });
}
