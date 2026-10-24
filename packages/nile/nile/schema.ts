import { writeFile } from "node:fs/promises";
import { Err, Ok, type Result, safeTry } from "slang-ts";
import type { Engine } from "../engine/types";
import { handleSchema } from "../rest/intent-handlers";
import type { NileSocket } from "../websocket/socket-types";

/** Export discovery contracts without requiring an HTTP listener or importing application boot code. */
export function createSchemaExporter(
  engine: Engine,
  websocket?: NileSocket
): (options: {
  path?: string;
}) => Promise<Result<{ services: unknown; topics: unknown }, string>> {
  return async (options: { path?: string } = {}) => {
    const services = await safeTry(() =>
      handleSchema(engine, {
        intent: "schema",
        service: "*",
        action: "*",
        payload: {},
      })
    );
    if (services.isErr || !services.value.status) {
      return Err("Could not export action schemas");
    }
    const topics = websocket ? await websocket.schema() : Ok({});
    if (topics.isErr) {
      return Err("Could not export topic schemas");
    }
    const document = { services: services.value.data, topics: topics.value };
    const path = options.path;
    if (path) {
      const written = await safeTry(() =>
        writeFile(path, JSON.stringify(document, null, 2), {
          encoding: "utf8",
          mode: 0o600,
        })
      );
      if (written.isErr) {
        return Err("Could not write schema export");
      }
    }
    return Ok(document);
  };
}
