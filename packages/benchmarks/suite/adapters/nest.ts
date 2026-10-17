import "reflect-metadata";
import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Module,
  Post,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ExpressAdapter } from "@nestjs/platform-express";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { z } from "zod";

const inputSchema = z.object({
  id: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  value: z.number().int().min(0).max(999),
});

type Input = z.infer<typeof inputSchema>;
type Mode = "plain" | "validated";

/** Register each operation through Nest's controller and method metadata. */
function createController({ action, mode }: { action: number; mode: Mode }) {
  @Controller(`actions/action-${action}`)
  class ActionController {
    @Post()
    @HttpCode(200)
    execute(@Body() body: Input) {
      if (mode === "plain") {
        return { id: body.id, value: body.value + 1, action };
      }

      const parsed = inputSchema.safeParse(body);
      if (!parsed.success) {
        throw new BadRequestException("Invalid input");
      }

      return { id: parsed.data.id, value: parsed.data.value + 1, action };
    }
  }

  return ActionController;
}

/** Build and initialize a native Nest application without opening a socket. */
export async function createNest({
  host,
  mode,
}: {
  host: "express" | "fastify";
  mode: Mode;
}) {
  const controllers = Array.from({ length: 300 }, (_, action) =>
    createController({ action, mode })
  );

  @Module({ controllers })
  class BenchmarkModule {}

  const adapter =
    host === "fastify"
      ? new FastifyAdapter({ logger: false })
      : new ExpressAdapter();
  const app = await NestFactory.create(BenchmarkModule, adapter, {
    logger: false,
    abortOnError: false,
  });
  await app.init();
  return app;
}
