import { Ok } from "slang-ts";
import {
  ACTION_COUNT,
  calculateResult,
  inputSchema,
} from "../shared/workload.mjs";

/** Build the public Nile pipeline; request listening is reserved for the owner-run launcher. */
export async function createNile({ mode, execute = calculateResult }) {
  const api = await import("../../../nile/dist/index.js");
  const server = await api.createNileServer({
    serverName: "nile-current-benchmark",
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
          handler: (payload) => Ok(execute({ payload, action })),
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
