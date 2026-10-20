import type { TopicDefinition, TopicDefinitions } from "./types";

/** Preserve schema inference without maintaining a parallel payload interface. */
export function createTopic<const T extends TopicDefinition>(definition: T): T {
  return definition;
}

/** Define a browser-safe contract registry; each Nile instance owns its own delivery state. */
export function createTopics<const T extends TopicDefinitions>(topics: T): T {
  for (const [name, definition] of Object.entries(topics)) {
    if (!name || name.length > 256 || !definition.schema?.safeParseAsync) {
      throw new Error("Topics require bounded names and validation schemas");
    }
  }
  return topics;
}
