/** Standard Nile API response shape */
export interface ExternalResponse<T = Record<string, unknown>> {
  status: boolean;
  message: string;
  data: T;
}

/** Result pattern: { error, data } (graceful failure over throwing) */
export interface ClientResult<T = Record<string, unknown>> {
  error: string | null;
  data: T | null;
}

/** Nile intent payload structure */
export interface NileIntentParams<T = Record<string, unknown>> {
  service: string;
  action: string;
  payload?: T;
}

/** Client configuration */
export interface NileClientConfig {
  baseUrl: string;
  credentials?: "include" | "omit" | "same-origin";
  headers?: Record<string, string>;
  /** Optional timeout in ms (default: 30000) */
  timeout?: number;
}

/** Options for individual fetch calls */
export interface FetchOptions extends Omit<RequestInit, "body" | "method"> {
  timeout?: number;
}

/** Interface for the typed client */
export interface NileClient<
  TPayloads = Record<string, Record<string, unknown>>,
> {
  /** Invoke an action with full type-safety for payload */
  invoke: <
    S extends keyof TPayloads & string,
    A extends keyof TPayloads[S] & string,
  >(
    params: {
      service: S;
      action: A;
      payload: TPayloads[S][A];
    } & FetchOptions
  ) => Promise<ClientResult>;

  /** Discover services/actions (supports "*" wildcard) */
  explore: (
    params: {
      service: string;
      action: string;
    } & FetchOptions
  ) => Promise<ClientResult>;

  /** Get action schemas as JSON Schema (supports "*" wildcard) */
  schema: (
    params: {
      service: string;
      action: string;
    } & FetchOptions
  ) => Promise<ClientResult>;
}
