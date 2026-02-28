import { safeTry } from "./safe-try.js";
import type {
  ClientResult,
  ExternalResponse,
  FetchOptions,
  NileClientConfig,
} from "./types.js";

/**
 * Handles communication with the Nile /services endpoint.
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
    const error: unknown = requestResult.error;
    let errorMsg = "An unknown error occurred";

    if (error instanceof Error) {
      errorMsg =
        error.name === "AbortError" ? "Request timed out" : error.message;
    } else {
      errorMsg = String(error);
    }

    return { error: errorMsg, data: null };
  }

  const result = requestResult.value;

  if (!result.status) {
    return { error: result.message, data: result.data };
  }

  return { error: null, data: result.data };
}
