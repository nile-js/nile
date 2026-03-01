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

/** Options for individual fetch calls (body and method are managed internally) */
export interface FetchOptions extends Omit<RequestInit, "body" | "method"> {
  timeout?: number;
}

/** Parameters for invoke (execute intent) */
export interface InvokeParams<
  TPayloads = Record<string, Record<string, unknown>>,
  S extends keyof TPayloads & string = keyof TPayloads & string,
  A extends keyof TPayloads[S] & string = keyof TPayloads[S] & string,
> {
  service: S;
  action: A;
  payload: TPayloads[S][A];
  fetchOptions?: FetchOptions;
}

/** Parameters for explore and schema intents */
export interface DiscoveryParams {
  service: string;
  action: string;
  fetchOptions?: FetchOptions;
}

/** Parameters for upload (multipart form-data execute) */
export interface UploadParams {
  service: string;
  action: string;
  /** Files to upload — keyed by field name */
  files: Record<string, File | File[]>;
  /** Additional string fields to include in the form data */
  fields?: Record<string, string>;
  fetchOptions?: FetchOptions;
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
      fetchOptions?: FetchOptions;
    }
  ) => Promise<ClientResult>;

  /** Discover services/actions (supports "*" wildcard) */
  explore: (params: DiscoveryParams) => Promise<ClientResult>;

  /** Get action schemas as JSON Schema (supports "*" wildcard) */
  schema: (params: DiscoveryParams) => Promise<ClientResult>;

  /** Upload files to an action via multipart form-data */
  upload: (params: UploadParams) => Promise<ClientResult>;
}
