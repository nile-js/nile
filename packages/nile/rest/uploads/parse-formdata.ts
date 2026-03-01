/**
 * Multipart form-data parsing and content-type enforcement.
 * Two parsing modes:
 * - "flat" (default): conflict detection — rejects same key used for both files and fields
 * - "structured": simple separation of fields and files with array aggregation
 *
 * Uses Hono's parseBody({ all: true }) for robust multipart parsing across HTTP clients.
 */

import type { Action } from "@/engine/types";
import type {
  FormDataResult,
  StructuredPayload,
  UploadsConfig,
  UploadValidationResult,
} from "./types";
import { validateFiles } from "./validate-files";

// --- Helpers ---

/** Collect all File objects from a FormData instance */
export function collectFiles(formData: FormData): File[] {
  const files: File[] = [];
  for (const [, value] of formData.entries()) {
    if (typeof value !== "string") {
      files.push(value);
    }
  }
  return files;
}

/**
 * Detect keys used for both files and fields in the same FormData.
 * These mixed keys are ambiguous and rejected in flat mode.
 */
export function detectMixedKeys(formData: FormData): string[] {
  const keyTypes = new Map<string, Set<"file" | "field">>();

  formData.forEach((value, key) => {
    if (key === "action") {
      return;
    }
    if (!keyTypes.has(key)) {
      keyTypes.set(key, new Set());
    }
    keyTypes.get(key)?.add(value instanceof File ? "file" : "field");
  });

  const conflicts: string[] = [];
  keyTypes.forEach((types, key) => {
    if (types.size > 1) {
      conflicts.push(key);
    }
  });
  return conflicts;
}

// --- Parsing ---

/**
 * Parse FormData into structured payload (structured mode).
 * Separates fields and files, aggregates duplicate keys into arrays.
 * Skips the 'action' key since it's part of the RPC routing, not the payload.
 */
export function parseFormData(formData: FormData): StructuredPayload {
  const fields: Record<string, string | string[]> = {};
  const files: Record<string, File | File[]> = {};

  formData.forEach((value, key) => {
    if (key === "action") {
      return;
    }

    if (value instanceof File) {
      if (key in files) {
        const existing = files[key];
        files[key] = Array.isArray(existing)
          ? [...existing, value]
          : [existing as File, value];
      } else {
        files[key] = value;
      }
    } else {
      const strValue = String(value);
      if (key in fields) {
        const existing = fields[key];
        fields[key] = Array.isArray(existing)
          ? [...existing, strValue]
          : [existing as string, strValue];
      } else {
        fields[key] = strValue;
      }
    }
  });

  return { fields, files };
}

/**
 * Parse FormData in flat mode with conflict detection.
 * Rejects forms where the same key carries both files and string fields.
 */
export function parseFormDataFlat(formData: FormData): FormDataResult {
  const conflicts = detectMixedKeys(formData);
  if (conflicts.length > 0) {
    return {
      status: false,
      message: "mixed key types not allowed",
      errorData: {
        error_category: "validation",
        conflicts,
        hint: "Same key cannot be used for both files and fields",
      },
    };
  }

  return { status: true, data: parseFormData(formData) };
}

/**
 * Parse request body using Hono's parseBody({ all: true }).
 * Handles array values and mixed-type detection for robust parsing
 * across different HTTP clients (browsers, curl, Postman, etc.).
 */
export async function parseBodyToStructured(c: {
  req: { parseBody: (opts: { all: true }) => Promise<Record<string, unknown>> };
}): Promise<FormDataResult> {
  try {
    const body = await c.req.parseBody({ all: true });

    const fields: Record<string, string | string[]> = {};
    const files: Record<string, File | File[]> = {};
    const conflicts: string[] = [];

    for (const [key, value] of Object.entries(body)) {
      if (key === "action") {
        continue;
      }

      if (Array.isArray(value)) {
        const hasFiles = value.some((v) => v instanceof File);
        const hasStrings = value.some((v) => typeof v === "string");

        if (hasFiles && hasStrings) {
          conflicts.push(key);
          continue;
        }

        if (hasFiles) {
          files[key] = value.filter((v): v is File => v instanceof File);
        } else {
          fields[key] = value.map((v) => String(v));
        }
      } else if (value instanceof File) {
        files[key] = value;
      } else {
        fields[key] = String(value);
      }
    }

    if (conflicts.length > 0) {
      return {
        status: false,
        message: "mixed key types not allowed",
        errorData: {
          error_category: "validation",
          conflicts,
          hint: "Same key cannot be used for both files and fields",
        },
      };
    }

    return { status: true, data: { fields, files } };
  } catch (error) {
    return {
      status: false,
      message: "failed to parse request body",
      errorData: {
        error_category: "parsing",
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

/**
 * Enforce content-type validation against an action's isSpecial.contentType.
 * Returns 415 Unsupported Media Type when the request content-type doesn't match.
 */
export function enforceActionContentType(
  action: Pick<Action, "isSpecial">,
  contentType: string,
  enforceContentType: boolean
): UploadValidationResult {
  if (!(enforceContentType && action.isSpecial?.contentType)) {
    return { status: true };
  }

  const expected = action.isSpecial.contentType;
  const matches = contentType.toLowerCase().includes(expected.toLowerCase());

  if (!matches) {
    return {
      status: false,
      statusCode: 415,
      message: "unsupported content type",
      data: {
        error_category: "validation",
        expected,
        received: contentType,
      },
    };
  }

  return { status: true };
}

/**
 * High-level upload handler: parses multipart form data, validates files,
 * and returns the structured payload ready for the action handler.
 *
 * This is the single entry point called from the REST layer for form-data requests.
 */
export async function handleFormDataRequest(
  c: {
    req: {
      parseBody: (opts: { all: true }) => Promise<Record<string, unknown>>;
    };
  },
  config: UploadsConfig,
  _uploadMode: "flat" | "structured" = "flat"
): Promise<FormDataResult> {
  // Step 1: Parse the form data
  const parseResult = await parseBodyToStructured(c);
  if (!(parseResult.status && parseResult.data)) {
    return parseResult;
  }

  const payload = parseResult.data;

  // Step 2: Collect files for validation
  const allFiles: File[] = [];
  for (const value of Object.values(payload.files)) {
    if (Array.isArray(value)) {
      allFiles.push(...value);
    } else {
      allFiles.push(value);
    }
  }

  // Step 3: Validate files against configured limits and allowlists
  const validationResult = validateFiles(allFiles, config);
  if (!validationResult.status) {
    return {
      status: false,
      message: validationResult.message,
      errorData: validationResult.data,
      statusCode: validationResult.statusCode,
    };
  }

  return { status: true, data: payload };
}
