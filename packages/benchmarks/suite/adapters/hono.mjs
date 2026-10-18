import { Hono } from "hono";
import {
  ACTION_COUNT,
  calculateResult,
  parsePayload,
} from "../shared/workload.mjs";

/** Keep Hono's real router, Fetch context and response serialization. */
export function createHono({ mode, execute = calculateResult }) {
  const app = new Hono();
  Array.from({ length: ACTION_COUNT }, (_, action) => {
    app.post(`/actions/action-${action}`, async (context) => {
      const parsed = parsePayload({ payload: await context.req.json(), mode });
      if (!parsed.status) return context.json({ message: parsed.message }, 400);
      return context.json(execute({ payload: parsed.data, action }));
    });
  });
  return app;
}
