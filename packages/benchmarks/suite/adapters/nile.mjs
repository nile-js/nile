import { Ok } from "slang-ts";
import {
  ACTION_COUNT,
  calculateResult,
  inputSchema,
} from "../shared/workload.mjs";

/** Build the public Nile pipeline; request listening is reserved for the owner-run launcher. */
export async function createNile({ mode, released = false }) {
  const api = released
    ? await import("nile-release")
    : await import("../../../nile/dist/index.js");
  const server = await api.createNileServer({
    serverName: released ? "nile-release-benchmark" : "nile-current-benchmark",
    forceNewInstance: true,
    logServices: false,
    diagnostics: false,
    services: [
      {
        name: "bench",
        description: "Benchmark operations",
        actions: Array.from({ length: ACTION_COUNT }, (_, action) => ({
          name: `action-${action}`,
          description: "Increment a value",
          ...(mode === "validated" ? { validation: inputSchema } : {}),
          handler: (payload) => Ok(calculateResult({ payload, action })),
        })),
      },
    ],
    rest: {
      baseUrl: "/api",
      allowedOrigins: [],
      enableStatus: false,
      diagnostics: false,
    },
  });
  return server;
}
