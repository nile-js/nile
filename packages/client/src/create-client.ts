import { sendNileRequest } from "./request.js";
import type {
  ClientResult,
  FetchOptions,
  NileClient,
  NileClientConfig,
} from "./types.js";

/**
 * Creates a type-safe Nile client for interacting with backend services.
 *
 * @param config - The client configuration including baseUrl
 * @returns A factory object with execute, explore, and schema methods
 *
 * @example
 * const nile = createNileClient<ServicePayloads>({ baseUrl: "/api" });
 * const { error, data } = await nile.invoke({
 *   service: "tasks",
 *   action: "create",
 *   payload: { title: "Buy milk" }
 * });
 */
export function createNileClient<
  TPayloads = Record<string, Record<string, unknown>>,
>(config: NileClientConfig): NileClient<TPayloads> {
  return {
    /** Invoke a service action through the backend engine pipeline */
    invoke: async <
      S extends keyof TPayloads & string,
      A extends keyof TPayloads[S] & string,
    >(
      params: { service: S; action: A; payload: TPayloads[S][A] } & FetchOptions
    ) => {
      const { service, action, payload, ...options } = params;
      const result = await sendNileRequest<Record<string, unknown>>(
        config,
        "execute",
        service,
        action,
        payload,
        options
      );
      return result as ClientResult;
    },

    /** Discover available services and actions (supports "*" wildcard) */
    explore: async (
      params: { service: string; action: string } & FetchOptions
    ) => {
      const { service, action, ...options } = params;
      return await sendNileRequest(
        config,
        "explore",
        service,
        action,
        {},
        options
      );
    },

    /** Get action schemas as JSON Schema (supports "*" wildcard) */
    schema: async (
      params: { service: string; action: string } & FetchOptions
    ) => {
      const { service, action, ...options } = params;
      return await sendNileRequest(
        config,
        "schema",
        service,
        action,
        {},
        options
      );
    },
  };
}
