import type z from "zod";
import {
  type ActionSchemaReader,
  extractActionSchema,
  handleSchema,
  intentHandlers,
} from "./intent-handlers";
import type { RestConfig } from "./types";

/** Reuse successful HTTP JSON conversions while keeping returned documents independently mutable. */
export function createActionSchemaReader({
  isCacheEnabled,
  readSchema = extractActionSchema,
}: {
  isCacheEnabled: () => boolean;
  readSchema?: ActionSchemaReader;
}): ActionSchemaReader {
  let cache = new WeakMap<z.ZodType, z.core.JSONSchema.BaseSchema>();
  let wasCacheEnabled = true;

  return (action) => {
    const isEnabled = isCacheEnabled();
    if (!isEnabled && wasCacheEnabled) {
      cache = new WeakMap();
    }
    wasCacheEnabled = isEnabled;

    const schema = action.validation;
    if (!schema) {
      return null;
    }
    if (!isEnabled || action.cacheSchema === false) {
      cache.delete(schema);
      return readSchema(action);
    }

    const cached = cache.get(schema);
    if (cached) {
      return structuredClone(cached);
    }
    const converted = readSchema(action);
    if (!converted) {
      return null;
    }
    cache.set(schema, converted);
    // Zod finalizes a JSON-safe document; cloning omits its nonenumerable ~standard methods.
    return structuredClone(converted);
  };
}

/** Own one lazy conversion cache per REST app and leave direct schema handlers dynamic. */
export function createRestIntentHandlers({
  config,
}: {
  config: Pick<RestConfig, "discovery">;
}): typeof intentHandlers {
  const readSchema = createActionSchemaReader({
    isCacheEnabled: () => config.discovery?.cacheSchemas !== false,
  });
  return {
    ...intentHandlers,
    schema: (engine, request) => handleSchema(engine, request, readSchema),
  };
}
