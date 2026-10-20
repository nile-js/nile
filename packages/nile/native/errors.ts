import type { ContentfulStatusCode } from "hono/utils/http-status";

/** Return a deliberate native HTTP error from routes or middleware without exposing an internal stack. */
export function createNativeHttpError(
  message: string,
  status: ContentfulStatusCode
): Error & { status: ContentfulStatusCode } {
  return Object.assign(new Error(message), { status });
}
