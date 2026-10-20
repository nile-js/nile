import { Err, Ok, type Result, safeTry } from "slang-ts";
import z from "zod";
import type { Engine } from "../engine/types";
import { runInRequestScope } from "../nile/request-scope";
import type { NileContext } from "../nile/types";
import type { WebSocketIdentity } from "./types";

const invocationSchema = z.object({
  service: z.string().min(1).max(256),
  action: z.string().min(1).max(256),
  payload: z.record(z.string(), z.json()),
});

/** Execute socket actions through the normal engine with isolated sessions and cancellation. */
export async function invokeSocketAction({
  engine,
  context,
  identity,
  signal,
  request,
  input,
  connection,
}: {
  engine: Engine;
  context: NileContext;
  identity: WebSocketIdentity;
  signal: AbortSignal;
  request: Request;
  input: z.input<z.ZodType>;
  connection: string;
}) {
  const parsed = invocationSchema.safeParse(input);
  if (!parsed.success) {
    return Err("Invalid action invocation");
  }
  const { service, action, payload } = parsed.data;
  const found = engine.getAction(service, action);
  if (
    found.isErr ||
    (found.value.visibility?.ws ?? found.value.visibility?.rest) === false
  ) {
    return Err("Action not available");
  }
  return await runInRequestScope(
    {
      context,
      ws: { connection },
      credentials: identity.credentials ?? { headers: request.headers },
      sessions: { ws: { ...identity.session }, rest: { ...identity.session } },
      execution: {
        requestId: crypto.randomUUID(),
        transport: "ws",
        signal,
        clientKey: identity.clientKey,
        headers: request.headers,
      },
    },
    () => safeTry(() => engine.executeAction(service, action, payload, context))
  );
}

/** A policy must explicitly approve access; subscribing never grants publication rights. */
export async function checkSocketPolicy(
  policy:
    | (() => Result<boolean, string> | Promise<Result<boolean, string>>)
    | undefined
) {
  if (!policy) {
    return Err("Topic access is not permitted");
  }
  const result = await safeTry(policy);
  return result.isOk && result.value === true
    ? Ok(true)
    : Err("Topic access denied");
}
