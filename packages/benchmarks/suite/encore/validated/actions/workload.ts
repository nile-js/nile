import type { IncomingMessage, ServerResponse } from "node:http";
import { safeTry } from "slang-ts";
import { z } from "zod";

interface BenchmarkInput {
  id: number;
  value: number;
}

const inputSchema = z.object({
  id: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  value: z.number().int().min(0).max(999),
});

/** Read real Node request bytes; parsing failures become ordinary bad requests. */
const readRequestBody = async (request: IncomingMessage) =>
  safeTry(async () => {
    let text = "";
    for await (const chunk of request) {
      text += String(chunk);
    }
    return JSON.parse(text) as BenchmarkInput;
  });

/** Use Encore's raw endpoint transport while isolating optional common Zod validation. */
export const createRawHandler =
  ({ action, isValidated }: { action: number; isValidated: boolean }) =>
  async (request: IncomingMessage, response: ServerResponse) => {
    const body = await readRequestBody(request);
    if (body.isErr) {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ message: "Invalid request body" }));
      return;
    }
    const parsed = isValidated ? inputSchema.safeParse(body.value) : null;
    if (parsed && !parsed.success) {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ message: "Invalid request body" }));
      return;
    }
    const input = parsed?.data ?? body.value;
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({
        id: input.id,
        value: input.value + 1,
        action,
      })
    );
  };
