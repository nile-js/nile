import type z from "zod";
import type { TopicDefinition } from "./types";

/** Define one topic; its scope schema types the permission checks. */
export function createTopic<
  const N extends string,
  D extends z.ZodType,
  S extends z.ZodType | undefined = undefined,
>(definition: TopicDefinition<N, D, S>): TopicDefinition<N, D, S> {
  return definition;
}

type TopicRegistry<L extends readonly TopicDefinition[]> = {
  [D in L[number] as D["name"]]: D;
};

/** Collect topics into a registry keyed by name; each Nile instance owns its own delivery state. */
export function createTopics<const L extends readonly TopicDefinition[]>(
  topics: L
): TopicRegistry<L> {
  const registry: Record<string, TopicDefinition> = {};
  for (const definition of topics) {
    const name = definition?.name;
    if (
      typeof name !== "string" ||
      !name ||
      name.length > 256 ||
      !definition.data?.safeParseAsync
    ) {
      throw new Error("Topics require bounded names and data schemas");
    }
    if (Object.hasOwn(registry, name)) {
      throw new Error(`Topic "${name}" is defined more than once`);
    }
    registry[name] = definition;
  }
  return registry as TopicRegistry<L>;
}
