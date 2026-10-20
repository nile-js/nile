import { Err } from "slang-ts";
import type { Engine } from "../engine/types";
import { getRequestStore, runInRequestScope } from "../nile/request-scope";
import type { NileContext } from "../nile/types";
import { createRequestId } from "./correlation";
import type { InvokeOptions } from "./types";

/** Call the real action engine without HTTP; no implicit bypass of configured JWT authentication. */
export function createInvoker(
  engine: Engine,
  context: NileContext,
  enabled = true
) {
  return (options: InvokeOptions): ReturnType<Engine["executeAction"]> => {
    if (!enabled) {
      return Promise.resolve(Err("RPC interface is disabled"));
    }
    const action = engine.getAction(options.service, options.action);
    if (action.isErr) {
      return Promise.resolve(Err(action.error));
    }
    if (action.value.visibility?.rpc === false) {
      return Promise.resolve(Err("Action is not available through RPC"));
    }
    const parent = getRequestStore();
    const session =
      options.session ??
      parent?.sessions.rpc ??
      parent?.sessions.rest ??
      parent?.sessions.ws;
    return Promise.resolve(
      runInRequestScope(
        {
          rpc: {},
          admissionSignal: parent?.admissionSignal,
          credentials:
            options.credentials ??
            parent?.credentials ??
            (parent?.execution?.headers
              ? { headers: parent.execution.headers }
              : undefined),
          sessions: session
            ? { rpc: { ...session }, rest: { ...session } }
            : {},
          execution: {
            requestId: createRequestId(
              options.requestId ?? parent?.execution?.requestId
            ),
            transport: "rpc",
            signal:
              options.signal ??
              parent?.execution?.signal ??
              new AbortController().signal,
            clientKey: options.clientKey ?? parent?.execution?.clientKey,
          },
        },
        () =>
          engine.executeAction(
            options.service,
            options.action,
            options.payload,
            context
          )
      )
    );
  };
}
