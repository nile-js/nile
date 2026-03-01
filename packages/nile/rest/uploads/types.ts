/** Structured payload separating string fields from File objects */
export interface StructuredPayload {
  fields: Record<string, string | string[]>;
  files: Record<string, File | File[]>;
}

/**
 * Internal validation result for the upload validation chain.
 * Carries structured error data for rich client-facing error responses,
 * unlike slang-ts Result which only carries a string error.
 */
export interface UploadValidationResult {
  status: boolean;
  message?: string;
  data?: Record<string, unknown>;
  /** HTTP status code override (e.g., 415 for content-type mismatch) */
  statusCode?: number;
}

/**
 * Result from form-data parsing functions.
 * On success: carries a StructuredPayload with separated fields/files.
 * On failure: carries error metadata in errorData (not data) to avoid type conflicts.
 */
export interface FormDataResult {
  status: boolean;
  message?: string;
  /** Parsed structured payload — only present on success */
  data?: StructuredPayload;
  /** Error details — only present on failure */
  errorData?: Record<string, unknown>;
  /** HTTP status code override */
  statusCode?: number;
}

/** Upload limits configuration — mirrors RestConfig.uploads.limits */
export interface UploadLimits {
  maxFiles?: number;
  maxFileSize?: number;
  minFileSize?: number;
  maxTotalSize?: number;
  maxFilenameLength?: number;
}

/** Allowlist for MIME types and file extensions */
export interface UploadAllowlist {
  mimeTypes?: string[];
  extensions?: string[];
}

/** Full upload configuration — mirrors RestConfig.uploads */
export interface UploadsConfig {
  enforceContentType?: boolean;
  limits?: UploadLimits;
  allow?: UploadAllowlist;
  diagnostics?: boolean;
}
