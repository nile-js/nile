import { Elysia } from "elysia";
import { node } from "@elysia/node";
import {
  ACTION_COUNT,
  calculateResult,
  parsePayload,
} from "../shared/workload.mjs";

/** Select Elysia's supported runtime adapter while preserving its compiled routing. */
export function createElysia({
  mode,
  runtime = "node",
  execute = calculateResult,
}) {
  const app = new Elysia(runtime === "node" ? { adapter: node() } : {});
  Array.from({ length: ACTION_COUNT }, (_, action) => {
    app.post(`/actions/action-${action}`, ({ body, set }) => {
      const parsed = parsePayload({ payload: body, mode });
      if (!parsed.status) {
        set.status = 400;
        return { message: parsed.message };
      }
      return execute({ payload: parsed.data, action });
    });
  });
  return app.compile();
}
