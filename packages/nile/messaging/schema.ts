import { Ok, safeTry } from "slang-ts";
import z from "zod";
import type { TopicDefinitions } from "./types";

/** Convert topic contracts only when discovery/export is requested. */
export function createTopicSchemaReader(topics: TopicDefinitions) {
  const cache = new WeakMap<z.ZodType, z.core.JSONSchema.BaseSchema>();
  const read = (schema: z.ZodType) => {
    const existing = cache.get(schema);
    if (existing) {
      return structuredClone(existing);
    }
    const converted = z.toJSONSchema(schema, { io: "input" });
    cache.set(schema, converted);
    return structuredClone(converted);
  };
  return () =>
    safeTry(() =>
      Ok(
        Object.fromEntries(
          Object.entries(topics).map(([name, definition]) => [
            name,
            {
              data: read(definition.schema),
              ...(definition.scope ? { scope: read(definition.scope) } : {}),
            },
          ])
        )
      )
    );
}
