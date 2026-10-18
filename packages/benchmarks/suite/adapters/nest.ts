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
type Execute = (options: {
  payload: Input;
  action: number;
}) => Input & { action: number };
const calculateResult: Execute = ({ payload, action }) => ({
  id: payload.id,
  value: payload.value + 1,
  action,
});

/** Register each operation through Nest's controller and method metadata. */
function createController({
  action,
  mode,
  execute,
}: {
  action: number;
  mode: Mode;
  execute: Execute;
}) {
  @Controller(`actions/action-${action}`)
  class ActionController {
    @Post()
    @HttpCode(200)
    execute(@Body() body: Input) {
      if (mode === "plain") {
        return execute({ payload: body, action });
      }

      const parsed = inputSchema.safeParse(body);
      if (!parsed.success) {
        throw new BadRequestException("Invalid input");
      }

      return execute({ payload: parsed.data, action });
    }
  }

  return ActionController;
}

/** Build and initialize a native Nest application without opening a socket. */
export async function createNest({
  host,
  mode,
  execute = calculateResult,
}: {
  host: "express" | "fastify";
  mode: Mode;
  execute?: Execute;
}) {
  const controllers = Array.from({ length: 300 }, (_, action) =>
    createController({ action, mode, execute })
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
