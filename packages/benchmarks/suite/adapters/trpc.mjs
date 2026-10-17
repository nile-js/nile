import { initTRPC } from "@trpc/server";
import { createHTTPServer } from "@trpc/server/adapters/standalone";
import {
  ACTION_COUNT,
  calculateResult,
  inputSchema,
} from "../shared/workload.mjs";

/** Retain the standalone tRPC protocol and one mutation per HTTP request. */
export function createTrpc({ mode }) {
  const t = initTRPC.create();
  const procedures = Object.fromEntries(
    Array.from({ length: ACTION_COUNT }, (_, action) => {
      const procedure =
        mode === "validated"
          ? t.procedure.input(inputSchema)
          : t.procedure.input((input) => input);
      return [
        `action-${action}`,
        procedure.mutation(({ input }) =>
          calculateResult({ payload: input, action })
        ),
      ];
    })
  );
  const router = t.router(procedures);
  return { router, server: createHTTPServer({ router, basePath: "/trpc/" }) };
}
