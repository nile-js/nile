import type z from "zod";

type PublicJson = z.output<ReturnType<typeof z.json>>;

/** Reserve raw for internal diagnostics, including enumerable copies and values produced by toJSON. */
export function serializePublicJson(value: unknown): string {
  const serialized = JSON.stringify(value, (key, item: unknown) =>
    key === "raw" ? undefined : item
  );
  if (serialized === undefined) {
    throw new Error("Response is not JSON serializable");
  }
  return serialized;
}

/** Materialize a wire-safe value before Socket.IO performs its own serialization. */
export function toPublicJson(value: unknown): PublicJson {
  return JSON.parse(serializePublicJson(value));
}

/** Cover custom JSON Responses as well as built-in action envelopes at the outer HTTP boundary. */
export async function sanitizeJsonResponse(
  response: Response
): Promise<Response> {
  const contentType = response.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (
    !(
      response.body &&
      (contentType === "application/json" || contentType?.endsWith("+json"))
    )
  ) {
    return response;
  }
  const value: unknown = JSON.parse(await response.text());
  const headers = new Headers(response.headers);
  // Rewriting a representation invalidates byte counts and content validators supplied upstream.
  for (const name of ["content-length", "etag", "content-md5", "digest"]) {
    headers.delete(name);
  }
  return new Response(serializePublicJson(value), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
