import { createServer } from "node:http";
import express from "express";
import fastify from "fastify";
import { createFixtureBase, listenNode, setCors } from "./node-shared.mjs";

/** Build real Node-hosted framework contenders with the same authenticated ecommerce handlers. */
export async function createNodeFixture(framework, mode) {
  const base = await createFixtureBase(mode);
  if (framework.startsWith("nest-")) {
    const { createNestFixture } = await import("./nest-fixture.mjs");
    return createNestFixture(framework, base);
  }
  if (framework === "adonis") {
    const { createAdonisFixture } = await import("./adonis-fixture.mjs");
    return createAdonisFixture(base);
  }
  if (framework === "trpc") {
    const { createTrpcFixture } = await import("./trpc-fixture.mjs");
    return createTrpcFixture(base);
  }
  if (framework === "express") {
    const app = express();
    app.disable("x-powered-by");
    app.use((request, response, next) => {
      setCors(
        request.headers,
        (key, value) => response.setHeader(key, value),
        request.method === "OPTIONS",
      );
      if (request.method === "OPTIONS") { return response.status(204).end(); }
      next();
    });
    app.use(express.json());
    base.definitions.forEach((definition) => {
      app.post(definition.path, async (request, response) => {
        const result = await base.execute(
          definition,
          request.body,
          request.headers,
        );
        return response.status(result.status).json(result.body);
      });
    });
    return { ...base, start: () => listenNode(createServer(app)) };
  }
  if (framework === "fastify") {
    const app = fastify({ logger: false });
    // biome-ignore lint/suspicious/useAwait: Fastify uses the async signature to select its promise lifecycle.
    app.addHook("onRequest", async (request, reply) => {
      setCors(
        request.headers,
        (key, value) => reply.header(key, value),
        request.method === "OPTIONS",
      );
      if (request.method === "OPTIONS") { return reply.code(204).send(); }
    });
    app.options("/*", (_request, reply) => reply.code(204).send());
    base.definitions.forEach((definition) => {
      app.post(definition.path, async (request, reply) => {
        const result = await base.execute(
          definition,
          request.body,
          request.headers,
        );
        return reply.code(result.status).send(result.body);
      });
    });
    await app.ready();
    return {
      ...base,
      start: async () => ({
        url: await app.listen({ host: "127.0.0.1", port: 0 }),
        close: () => app.close(),
      }),
    };
  }
  throw new Error(`Unsupported Node framework: ${framework}`);
}
