import express from "express";
import {
  ACTION_COUNT,
  calculateResult,
  parsePayload,
} from "../shared/workload.mjs";

/** Use Express JSON parsing, native route dispatch and response serialization. */
export function createExpress({ mode, execute = calculateResult }) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json());
  Array.from({ length: ACTION_COUNT }, (_, action) => {
    app.post(`/actions/action-${action}`, (request, response) => {
      const parsed = parsePayload({ payload: request.body, mode });
      if (!parsed.status)
        return response.status(400).json({ message: parsed.message });
      return response.json(execute({ payload: parsed.data, action }));
    });
  });
  return app;
}
