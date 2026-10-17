import { z } from "zod";

export const ACTION_COUNT = 300;
export const inputSchema = z.object({
  id: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  value: z.number().int().min(0).max(999),
});

/** Keep business work identical while checking the selected operation in each response. */
export function calculateResult({ payload, action }) {
  return { id: payload.id, value: payload.value + 1, action };
}

/** Match common validation rules without giving one framework additional business work. */
export function parsePayload({ payload, mode }) {
  if (mode === "plain") return { status: true, data: payload };
  const parsed = inputSchema.safeParse(payload);
  return parsed.success
    ? { status: true, data: parsed.data }
    : { status: false, message: "Invalid input" };
}
