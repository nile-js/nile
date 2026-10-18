import fastify from "fastify";
import {
  ACTION_COUNT,
  calculateResult,
  parsePayload,
} from "../shared/workload.mjs";

/** Keep Fastify's normal request lifecycle; common validation uses the same Zod schema. */
export async function createFastify({ mode, execute = calculateResult }) {
  const app = fastify({ logger: false });
  Array.from({ length: ACTION_COUNT }, (_, action) => {
    app.post(`/actions/action-${action}`, (request, reply) => {
      const parsed = parsePayload({ payload: request.body, mode });
      if (!parsed.status)
        return reply.code(400).send({ message: parsed.message });
      return execute({ payload: parsed.data, action });
    });
  });
  await app.ready();
  return app;
}
