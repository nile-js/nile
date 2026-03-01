import { safeTry } from "./safe-try.js";
import type {
  ClientResult,
  ExternalResponse,
  FetchOptions,
  NileClientConfig,
} from "./types.js";

/**
 * Handles JSON communication with the Nile /services endpoint.
 * Uses fetch + safeTry for crash safety and consistent { error, data } results.
 */
export async function sendNileRequest<T = Record<string, unknown>>(
  config: NileClientConfig,
  intent: "explore" | "execute" | "schema",
  service: string,
  action: string,
  payload: unknown,
  options: FetchOptions = {}
): Promise<ClientResult<T>> {
  const { timeout = config.timeout ?? 30_000, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  const requestResult = await safeTry(async () => {
    const response = await fetch(`${config.baseUrl}/services`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...config.headers,
        ...(fetchOptions.headers as Record<string, string>),
      },
      credentials: config.credentials,
      body: JSON.stringify({
        intent,
        service,
        action,
        payload: payload ?? {},
      }),
      signal: controller.signal,
      ...fetchOptions,
    });

    clearTimeout(timeoutId);

    const json = (await response.json()) as ExternalResponse<T>;
    return json;
  });

  if (requestResult.isErr) {
    return resolveError(requestResult.error);
  }

  const result = requestResult.value;

  if (!result.status) {
    return { error: result.message, data: result.data };
  }

  return { error: null, data: result.data };
}

/**
 * Handles multipart form-data uploads to the Nile /services endpoint.
 * Builds a FormData body with RPC routing fields (intent, service, action),
 * user-provided fields, and file attachments.
 *
 * Content-Type header is intentionally omitted so the runtime sets the
 * correct multipart boundary automatically.
 */
export async function sendUploadRequest<T = Record<string, unknown>>(
  config: NileClientConfig,
  service: string,
  action: string,
  files: Record<string, File | File[]>,
  fields?: Record<string, string>,
  options: FetchOptions = {}
): Promise<ClientResult<T>> {
  const { timeout = config.timeout ?? 30_000, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  const formData = buildFormData(service, action, files, fields);

  const requestResult = await safeTry(async () => {
    // Spread config.headers but strip Content-Type — let the runtime set multipart boundary
    const { "Content-Type": _ct, ...safeHeaders } = config.headers ?? {};
    const { "Content-Type": _ct2, ...safeFetchHeaders } =
      (fetchOptions.headers as Record<string, string>) ?? {};

    const response = await fetch(`${config.baseUrl}/services`, {
      method: "POST",
      headers: {
        ...safeHeaders,
        ...safeFetchHeaders,
      },
      credentials: config.credentials,
      body: formData,
      signal: controller.signal,
      ...fetchOptions,
    });

    clearTimeout(timeoutId);

    const json = (await response.json()) as ExternalResponse<T>;
    return json;
  });

  if (requestResult.isErr) {
    return resolveError(requestResult.error);
  }

  const result = requestResult.value;

  if (!result.status) {
    return { error: result.message, data: result.data };
  }

  return { error: null, data: result.data };
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

/** Resolve error from safeTry into a ClientResult */
function resolveError<T>(error: unknown): ClientResult<T> {
  let errorMsg = "An unknown error occurred";

  if (error instanceof Error) {
    errorMsg =
      error.name === "AbortError" ? "Request timed out" : error.message;
  } else {
    errorMsg = String(error);
  }

  return { error: errorMsg, data: null };
}
