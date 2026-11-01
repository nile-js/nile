import { nanoid } from "nanoid";

/** A unique diagnostic reference, never a classification or HTTP status code. */
export function createErrorCode(): string {
  return nanoid(12);
}

/** Preserve application wording while presenting a readable diagnostic reference. */
export function formatErrorMessage(errorCode: string, message: string): string {
  return `Error Code: ${errorCode} - ${message}`;
}
