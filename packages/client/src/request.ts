import { clientErr, clientOk } from "./result.js";
import { safeTry } from "./safe-try.js";
import type {
  ClientResult,
  ExternalResponse,
  FetchOptions,
  NileClientConfig,
} from "./types.js";

/** Send one action call; the deadline covers both fetch and reading its JSON body. */
async function sendRequest<T>(
  config: NileClientConfig,
  body: () => BodyInit,
  multipart: boolean,
  options: FetchOptions
): Promise<ClientResult<T>> {
  const {
    timeout = config.timeout ?? 30_000,
    headers,
    signal,
    ...fetchOptions
  } = options;
  if (
    !Number.isSafeInteger(timeout) ||
    timeout < 1 ||
    timeout > 2_147_483_647
  ) {
    return clientErr(
      "Action timeout must be a positive integer up to 2147483647 milliseconds."
    );
  }
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) {
    abort();
  } else {
    signal?.addEventListener("abort", abort, { once: true });
  }
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeout);

  try {
    const requestResult = await safeTry(async () => {
      const mergedHeaders = new Headers(config.headers);
      new Headers(headers).forEach((value, key) => {
        mergedHeaders.set(key, value);
      });
      if (multipart) {
        mergedHeaders.delete("content-type");
      } else {
        mergedHeaders.set("content-type", "application/json");
      }
      const response = await fetch(
        `${config.baseUrl.replace(/\/+$/, "")}/services`,
        {
          ...fetchOptions,
          method: "POST",
          headers: mergedHeaders,
          credentials: fetchOptions.credentials ?? config.credentials,
          body: body(),
          signal: controller.signal,
        }
      );
      const json: unknown = await response.json();
      if (
        json === null ||
        typeof json !== "object" ||
        !("status" in json) ||
        typeof json.status !== "boolean" ||
        !("message" in json) ||
        typeof json.message !== "string" ||
        !("data" in json)
      ) {
        throw new Error("Invalid Nile action response.");
      }
      return json as ExternalResponse<T>;
    });
    if (requestResult.isErr) {
      if (timedOut) {
        return clientErr("Action timed out.");
      }
      if (signal?.aborted) {
        return clientErr("Action cancelled.");
      }
      return resolveError(requestResult.error);
    }
    const result = requestResult.value;
    if (!result.status) {
      return clientErr(result.message, result.data ?? null);
    }
    return clientOk(result.data, result.message);
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abort);
  }
}

/** JSON action calls preserve the server's message and failure data unchanged. */
export function sendNileRequest<T = Record<string, unknown>>(
  config: NileClientConfig,
  intent: "explore" | "execute" | "schema",
  service: string,
  action: string,
  payload: unknown,
  options: FetchOptions = {}
): Promise<ClientResult<T>> {
  return sendRequest<T>(
    config,
    () =>
      JSON.stringify({
        intent: intent,
        service: service,
        action: action,
        payload: payload ?? {},
      }),
    false,
    options
  );
}

/** Let the runtime set the multipart boundary; retain the same action Result contract. */
export function sendUploadRequest<T = Record<string, unknown>>(
  config: NileClientConfig,
  service: string,
  action: string,
  files: Record<string, File | File[]>,
  fields?: Record<string, string>,
  options: FetchOptions = {}
): Promise<ClientResult<T>> {
  return sendRequest<T>(
    config,
    () => buildFormData(service, action, files, fields),
    true,
    options
  );
}

/**
 * Builds a FormData instance with RPC routing fields and file/field entries.
 * The server expects 'intent', 'service', 'action' as string fields.
 */
export function buildFormData(
  service: string,
  action: string,
  files: Record<string, File | File[]>,
  fields?: Record<string, string>
): FormData {
  const formData = new FormData();

  // RPC routing fields the server expects
  formData.append("intent", "execute");
  formData.append("service", service);
  formData.append("action", action);

  // User-provided string fields
  if (fields) {
    for (const [key, value] of Object.entries(fields)) {
      formData.append(key, value);
    }
  }

  // File attachments — arrays append multiple entries under the same key
  for (const [key, value] of Object.entries(files)) {
    if (Array.isArray(value)) {
      for (const file of value) {
        formData.append(key, file);
      }
    } else {
      formData.append(key, value);
    }
  }

  return formData;
}

/** Convert local transport errors to the same client failure shape. */
function resolveError(error: unknown): ClientResult<never> {
  return clientErr(error instanceof Error ? error.message : String(error));
}
