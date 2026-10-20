import "reflect-metadata";
import {
  Body,
  Controller,
  HttpCode,
  Module,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ExpressAdapter } from "@nestjs/platform-express";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { setCors } from "./node-shared.mjs";

/** Generate actual Nest controller metadata; classes are explicitly approved for native benchmark fixtures. */
function createController(definition, base) {
  class EcommerceController {
    async execute(body, request, response) {
      const result = await base.execute(definition, body, request.headers);
      response.status(result.status);
      return result.body;
    }
  }
  Controller(definition.path.slice(1))(EcommerceController);
  const descriptor = Object.getOwnPropertyDescriptor(
    EcommerceController.prototype,
    "execute",
  );
  Post()(EcommerceController.prototype, "execute", descriptor);
  HttpCode(200)(EcommerceController.prototype, "execute", descriptor);
  Body()(EcommerceController.prototype, "execute", 0);
  Req()(EcommerceController.prototype, "execute", 1);
  Res({ passthrough: true })(EcommerceController.prototype, "execute", 2);
  return EcommerceController;
}

/** Initialize Nest's full controller pipeline with its selected supported HTTP adapter. */
export async function createNestFixture(framework, base) {
  const controllers = base.definitions.map((definition) =>
    createController(definition, base),
  );
  class EcommerceModule {}
  Module({ controllers })(EcommerceModule);
  const adapter =
    framework === "nest-fastify"
      ? new FastifyAdapter({ logger: false })
      : new ExpressAdapter();
  const app = await NestFactory.create(EcommerceModule, adapter, {
    logger: false,
    abortOnError: false,
  });
  app.use((request, response, next) => {
    setCors(
      request.headers,
      (key, value) => response.setHeader(key, value),
      request.method === "OPTIONS",
    );
    if (request.method === "OPTIONS") {
      response.statusCode = 204;
      return response.end();
    }
    next();
  });
  await app.init();
  return {
    ...base,
    start: async () => {
      await app.listen(0, "127.0.0.1");
      return { url: await app.getUrl(), close: () => app.close() };
    },
  };
}
