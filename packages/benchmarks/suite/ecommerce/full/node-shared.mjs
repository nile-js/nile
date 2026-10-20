import { sign } from "hono/jwt";
import { safeTry } from "slang-ts";
import {
  createDefinitions,
  createStore,
  CUSTOMER,
  SECRET,
} from "../workload.mjs";
import { createCorsHeaders, executeRequest } from "../fixtures.mjs";

/** Bind shared ecommerce behavior without changing the framework's body parser or response mapping. */
export async function createFixtureBase(mode) {
  if (!["plain", "validated"].includes(mode)) {
    throw new Error("Invalid benchmark mode");
  }
  const store = createStore();
  const definitions = createDefinitions();
  const token = await sign(
    {
      sub: CUSTOMER,
      organizationId: "benchmark",
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
    SECRET,
    "HS256",
  );
  return {
    definitions,
    store,
    headers: {
      origin: "https://store.example",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    routeCount: definitions.length,
    reset: store.reset,
    state: store.state,
    execute: (definition, payload, headers) =>
      executeRequest({
        request: { headers: new Headers(headers) },
        payload,
        definition,
        store,
        mode,
      }),
  };
}

/** Apply identical CORS headers through each framework's native response setter. */
export function setCors(headers, setter, preflight = false) {
  createCorsHeaders({ headers: new Headers(headers) }, preflight).forEach(
    (value, key) => { setter(key, value); },
  );
}

/** Listen on an ephemeral loopback port and reject socket errors immediately. */
export async function listenNode(server, terminate) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Missing benchmark listener address");
  }
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: async () => {
      const closed = await safeTry(
        () =>
          new Promise((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          ),
      );
      if (terminate) { await terminate(); }
      if (closed.isErr) { throw closed.error; }
    },
  };
}
