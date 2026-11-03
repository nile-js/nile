import { sendNileRequest, sendUploadRequest } from "./request.js";
import { createNileSocket } from "./socket-client.js";
import type { SocketTopics, TopicShape } from "./socket-types.js";
import type { NileClient, NileClientConfig, UploadParams } from "./types.js";

/**
 * Creates a type-safe Nile client for interacting with backend services.
 *
 * @param config - The client configuration including baseUrl
 * @returns A factory object with invoke, explore, schema and upload methods, plus
 *   `socket` for topics. The socket connects on its first `send` or `receive`.
 *
 * @example
 * const nile = createNileClient<ServicePayloads>({ baseUrl: "/api" });
 * const result = await nile.invoke({
 *   service: "tasks",
 *   action: "create",
 *   payload: { title: "Buy milk" }
 * });
 * if (result.isErr) {
 *   console.error(result.error);
 * } else {
 *   console.log(result.value);
 * }
 *
 * const received = await nile.socket.receive({
 *   topic: "tasks.updated",
 *   onMessage: (message) => console.log(message.data),
 * });
 */
export function createNileClient<
  TPayloads = Record<string, Record<string, unknown>>,
  TTopics extends TopicShape<TTopics> = SocketTopics,
>(config: NileClientConfig): NileClient<TPayloads, TTopics> {
  return {
    socket: createNileSocket<TTopics>({
      ...config.socket,
      url: config.socket?.url ?? config.baseUrl,
    }),

    /** Invoke a service action through the backend engine pipeline */
    invoke: async <
      S extends keyof TPayloads & string,
      A extends keyof TPayloads[S] & string,
    >(params: {
      service: S;
      action: A;
      payload: TPayloads[S][A];
      fetchOptions?: Parameters<typeof sendNileRequest>[5];
    }) => {
      const { service, action, payload, fetchOptions } = params;
      const result = await sendNileRequest<Record<string, unknown>>(
        config,
        "execute",
        service,
        action,
        payload,
        fetchOptions
      );
      return result;
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
