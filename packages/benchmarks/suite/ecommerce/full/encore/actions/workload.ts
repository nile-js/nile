import { readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { safeTry } from "slang-ts";
import { verifyJWT } from "../../../../../../nile/dist/index.js";
import {
  createDefinitions,
  createStore,
  SECRET,
  serializeResult,
} from "../../../workload.mjs";

type Configuration = { mode: "plain" | "validated" };
const config = JSON.parse(
  await readFile("/tmp/nile-ecommerce-encore.json", "utf8")
) as Configuration;
if (!["plain", "validated"].includes(config.mode)) {
  throw Error("Encore ecommerce requires an explicit benchmark mode");
}
const store = createStore();
const definitions = createDefinitions();

/** Decode a raw transport body without changing shared operation payloads. */
async function readPayload(request: IncomingMessage) {
  let text = "";
  for await (const chunk of request) text += String(chunk);
  return JSON.parse(text);
}

/** Send the same JSON Result body and origin policy used by other contenders. */
function sendResponse(
  request: IncomingMessage,
  response: ServerResponse,
  status: number,
  body: object
) {
  response.setHeader("Content-Type", "application/json");
  // The production Rust server applies global_cors; duplicating it invalidates browser responses.
  response.writeHead(status);
  response.end(JSON.stringify(body));
}

/** Keep the shared verifier's Headers input identical across native transports. */
function createHeaders(request: IncomingMessage) {
  const headers = new Headers();
  Object.entries(request.headers).forEach(([name, value]) => {
    if (Array.isArray(value)) value.forEach((entry) => headers.append(name, entry));
    else if (value !== undefined) headers.set(name, value);
  });
  return headers;
}

/** Bind each compiler-visible Encore endpoint to the same ecommerce workload. */
export function createRawHandler(index: number) {
  const definition = definitions[index];
  if (!definition) throw Error("Missing ecommerce endpoint definition");
  return async (request: IncomingMessage, response: ServerResponse) => {
    if (request.method === "OPTIONS") {
      response.setHeader("Access-Control-Allow-Methods", "POST,GET,OPTIONS");
      response.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
      response.setHeader("Access-Control-Max-Age", "600");
      sendResponse(request, response, 204, {});
      return;
    }
    const body = await safeTry(() => readPayload(request));
    if (body.isErr) {
      sendResponse(request, response, 400, {
        status: false, message: "Invalid request body", data: {},
      });
      return;
    }
    const auth = await verifyJWT(
      { headers: createHeaders(request) },
      { secret: SECRET }
    );
    if (auth.isErr) {
      sendResponse(request, response, 400, {
        status: false, message: auth.error, data: {},
      });
      return;
    }
    let input = body.value;
    if (config.mode === "validated") {
      const parsed = definition.schema.safeParse(input);
      if (!parsed.success) {
        sendResponse(request, response, 400, {
          status: false, message: "Invalid input", data: {},
        });
        return;
      }
      input = parsed.data;
    }
    const result = store.execute(
      definition.shop, definition.operation, input, auth.value.userId
    );
    sendResponse(
      request, response, result.isOk ? 200 : 400,
      serializeResult(definition.shop, definition.operation, result)
    );
  };
}

/** Reset warmup state without restarting the production runtime or timing control traffic. */
export async function controlHandler(
  request: IncomingMessage,
  response: ServerResponse
) {
  if (request.headers["x-benchmark-control"] !== "isolated-ecommerce-control") {
    sendResponse(request, response, 403, { status: false });
    return;
  }
  const body = await safeTry(() => readPayload(request));
  if (body.isErr || !["reset", "state"].includes(body.value.operation)) {
    sendResponse(request, response, 400, { status: false });
    return;
  }
  if (body.value.operation === "reset") store.reset();
  sendResponse(request, response, 200, { status: true, state: store.state() });
}
