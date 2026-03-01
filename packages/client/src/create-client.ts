import { sendNileRequest, sendUploadRequest } from "./request.js";
import type {
  ClientResult,
  NileClient,
  NileClientConfig,
  UploadParams,
} from "./types.js";

/**
 * Creates a type-safe Nile client for interacting with backend services.
 *
 * @param config - The client configuration including baseUrl
 * @returns A factory object with invoke, explore, schema, and upload methods
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
      params: {
        service: S;
        action: A;
        payload: TPayloads[S][A];
        fetchOptions?: Parameters<typeof sendNileRequest>[5];
      }
    ) => {
      const { service, action, payload, fetchOptions } = params;
      const result = await sendNileRequest<Record<string, unknown>>(
        config,
        "execute",
        service,
        action,
        payload,
        fetchOptions
      );
      return result as ClientResult;
    },

    /** Discover available services and actions (supports "*" wildcard) */
    explore: async (params) => {
      const { service, action, fetchOptions } = params;
      return await sendNileRequest(
        config,
        "explore",
        service,
        action,
        {},
        fetchOptions
      );
    },

    /** Get action schemas as JSON Schema (supports "*" wildcard) */
    schema: async (params) => {
      const { service, action, fetchOptions } = params;
      return await sendNileRequest(
        config,
        "schema",
        service,
        action,
        {},
        fetchOptions
      );
    },

    /** Upload files to an action via multipart form-data */
    upload: async (params: UploadParams) => {
      const { service, action, files, fields, fetchOptions } = params;
      return await sendUploadRequest(
        config,
        service,
        action,
        files,
        fields,
        fetchOptions
      );
    },
  };
}
