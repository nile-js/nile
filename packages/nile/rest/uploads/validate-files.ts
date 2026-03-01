/**
 * File validation chain for multipart uploads.
 * 7-step sequential validation: filename length -> zero-byte -> min size ->
 * file count -> max file size -> total size -> MIME + extension allowlist.
 * Fails fast on first validation error.
 */

import type { UploadsConfig, UploadValidationResult } from "./types";

// --- Default limits ---

const DEFAULT_MAX_FILES = 10;
const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const DEFAULT_MIN_FILE_SIZE = 1; // 1 byte — rejects zero-byte files
const DEFAULT_MAX_TOTAL_SIZE = 20 * 1024 * 1024; // 20MB
const DEFAULT_MAX_FILENAME_LENGTH = 128;
const DEFAULT_ALLOWED_MIMES = ["image/png", "image/jpeg", "application/pdf"];
const DEFAULT_ALLOWED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".pdf"];

const PASS: UploadValidationResult = { status: true };

// --- Individual validators ---

/** Reject files with names exceeding the configured length limit */
export function validateFilenameLength(
  files: File[],
  maxLength: number
): UploadValidationResult {
  const tooLong = files.filter((file) => file.name.length > maxLength);
  if (tooLong.length === 0) {
    return PASS;
  }

  return {
    status: false,
    message: "file name too long",
    data: {
      error_category: "validation",
      files: tooLong.map((f) => f.name),
      maxLength,
    },
  };
}

/** Reject zero-byte (empty) files */
export function validateZeroByteFiles(files: File[]): UploadValidationResult {
  const emptyFiles = files.filter((file) => file.size === 0);
  if (emptyFiles.length === 0) {
    return PASS;
  }

  return {
    status: false,
    message: "empty file not allowed",
    data: {
      error_category: "validation",
      files: emptyFiles.map((f) => f.name),
    },
  };
}

/** Reject files smaller than the minimum size threshold */
export function validateMinFileSize(
  files: File[],
  minFileSize: number
): UploadValidationResult {
  const tooSmall = files.filter((file) => file.size < minFileSize);
  if (tooSmall.length === 0) {
    return PASS;
  }

  return {
    status: false,
    message: "file too small",
    data: {
      error_category: "validation",
      limit: "minFileSize",
      min: minFileSize,
      files: tooSmall.map((f) => ({ name: f.name, size: f.size })),
    },
  };
}

/** Reject uploads exceeding the maximum file count */
export function validateFileCount(
  files: File[],
  maxFiles: number
): UploadValidationResult {
  if (files.length <= maxFiles) {
    return PASS;
  }

  return {
    status: false,
    message: "upload limit exceeded",
    data: {
      error_category: "validation",
      limit: "maxFiles",
      max: maxFiles,
      received: files.length,
    },
  };
}

/** Reject individual files exceeding the per-file size limit */
export function validateFileSize(
  files: File[],
  maxFileSize: number
): UploadValidationResult {
  const oversized = files.filter((file) => file.size > maxFileSize);
  if (oversized.length === 0) {
    return PASS;
  }

  return {
    status: false,
    message: "upload limit exceeded",
    data: {
      error_category: "validation",
      limit: "maxFileSize",
      max: maxFileSize,
      files: oversized.map((f) => ({ name: f.name, size: f.size })),
    },
  };
}

/** Reject uploads where the combined file size exceeds the total limit */
export function validateTotalSize(
  files: File[],
  maxTotalSize: number
): UploadValidationResult {
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  if (totalSize <= maxTotalSize) {
    return PASS;
  }

  return {
    status: false,
    message: "upload limit exceeded",
    data: {
      error_category: "validation",
      limit: "maxTotalSize",
      max: maxTotalSize,
      total: totalSize,
    },
  };
}

/** Reject files that don't match the allowed MIME types AND extensions */
export function validateAllowlist(
  files: File[],
  allowedMimes: string[],
  allowedExtensions: string[]
): UploadValidationResult {
  const rejected = files.filter((file) => {
    const matchesMime = allowedMimes.includes(file.type);
    const matchesExt = allowedExtensions.some((ext) =>
      file.name.toLowerCase().endsWith(ext.toLowerCase())
    );
    return !(matchesMime && matchesExt);
  });

  if (rejected.length === 0) {
    return PASS;
  }

  return {
    status: false,
    message: "file type not allowed",
    data: {
      error_category: "validation",
      rejected: rejected.map((f) => ({ name: f.name, type: f.type })),
      allowed: { mimeTypes: allowedMimes, extensions: allowedExtensions },
    },
  };
}

// --- Composite validator ---

/**
 * Run the full 7-step validation chain on an array of files.
 * Fails fast on the first validation error. Returns { status: true } if all pass.
 */
export function validateFiles(
  files: File[],
  config: UploadsConfig
): UploadValidationResult {
  if (files.length === 0) {
    return PASS;
  }

  const maxFiles = config.limits?.maxFiles ?? DEFAULT_MAX_FILES;
  const maxFileSize = config.limits?.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
  const minFileSize = config.limits?.minFileSize ?? DEFAULT_MIN_FILE_SIZE;
  const maxTotalSize = config.limits?.maxTotalSize ?? DEFAULT_MAX_TOTAL_SIZE;
  const maxFilenameLength =
    config.limits?.maxFilenameLength ?? DEFAULT_MAX_FILENAME_LENGTH;
  const allowedMimes = config.allow?.mimeTypes ?? DEFAULT_ALLOWED_MIMES;
  const allowedExtensions =
    config.allow?.extensions ?? DEFAULT_ALLOWED_EXTENSIONS;

  // Sequential fail-fast chain
  const checks: UploadValidationResult[] = [
    validateFilenameLength(files, maxFilenameLength),
    validateZeroByteFiles(files),
    validateMinFileSize(files, minFileSize),
    validateFileCount(files, maxFiles),
    validateFileSize(files, maxFileSize),
    validateTotalSize(files, maxTotalSize),
    validateAllowlist(files, allowedMimes, allowedExtensions),
  ];

  for (const check of checks) {
    if (!check.status) {
      return check;
    }
  }

  return PASS;
}
