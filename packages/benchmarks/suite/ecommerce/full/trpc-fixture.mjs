import { initTRPC, TRPCError } from "@trpc/server";
import { createHTTPServer } from "@trpc/server/adapters/standalone";
import { listenNode, setCors } from "./node-shared.mjs";

/** Keep tRPC's real mutation protocol and response envelope, with shared JWT/Zod work inside each resolver. */
export function createTrpcFixture(base) {
  const t = initTRPC.context().create();
  const procedures = Object.fromEntries(
    base.definitions.map((definition) => [
      `${definition.shop}.${definition.operation}`,
      t.procedure
        .input((input) => input)
        .mutation(async ({ input, ctx }) => {
          const result = await base.execute(definition, input, ctx.headers);
          if (result.status !== 200) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: result.body.message,
            });
          }
          return result.body;
        }),
    ]),
  );
  const router = t.router(procedures);
  const server = createHTTPServer({
    router,
    basePath: "/trpc/",
    createContext: ({ req }) => ({ headers: req.headers }),
    middleware: (request, response, next) => {
      const preflight = request.method === "OPTIONS";
      setCors(
        request.headers,
        (key, value) => response.setHeader(key, value),
        preflight,
      );
      if (preflight) {
        response.statusCode = 204;
        return response.end();
      }
      next();
    },
  });
  return { ...base, protocol: "trpc", start: () => listenNode(server) };
}
