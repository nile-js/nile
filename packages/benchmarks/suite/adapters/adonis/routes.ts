import type { Router } from "@adonisjs/core/http";
import { z } from "zod";

const inputSchema = z.object({
  id: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  value: z.number().int().min(0).max(999),
});

type Input = z.infer<typeof inputSchema>;
export type Execute = (options: {
  payload: Input;
  action: number;
}) => Input & { action: number };
const calculateResult: Execute = ({ payload, action }) => ({
  id: payload.id,
  value: payload.value + 1,
  action,
});

/** Define 300 real router entries through Adonis's core router. */
export function registerRoutes({
  router,
  mode,
  execute = calculateResult,
}: {
  router: Router;
  mode: "plain" | "validated";
  execute?: Execute;
}) {
  Array.from({ length: 300 }, (_, action) => {
    router.post(`/actions/action-${action}`, ({ request, response }) => {
      const body = request.body() as Input;
      if (mode === "plain") {
        return execute({ payload: body, action });
      }

      const parsed = inputSchema.safeParse(body);
      if (!parsed.success) {
        return response.badRequest({ message: "Invalid input" });
      }

      return execute({ payload: parsed.data, action });
    });
  });
}
