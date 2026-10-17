import type { Router } from "@adonisjs/core/http";
import { z } from "zod";

const inputSchema = z.object({
  id: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  value: z.number().int().min(0).max(999),
});

type Input = z.infer<typeof inputSchema>;

/** Define 300 real router entries through Adonis's core router. */
export function registerRoutes({
  router,
  mode,
}: {
  router: Router;
  mode: "plain" | "validated";
}) {
  Array.from({ length: 300 }, (_, action) => {
    router.post(`/actions/action-${action}`, ({ request, response }) => {
      const body = request.body() as Input;
      if (mode === "plain") {
        return { id: body.id, value: body.value + 1, action };
      }

      const parsed = inputSchema.safeParse(body);
      if (!parsed.success) {
        return response.badRequest({ message: "Invalid input" });
      }

      return { id: parsed.data.id, value: parsed.data.value + 1, action };
    });
  });
}
