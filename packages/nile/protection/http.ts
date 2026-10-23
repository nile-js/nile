import { resolveClientAddress } from "./client-address";

export { resolveClientAddress } from "./client-address";

import { Err, Ok, type Result, safeTry } from "slang-ts";
import { createRequestId } from "../execution/correlation";
import type { NileLifecycle } from "../lifecycle/types";
import { runInRequestScope } from "../nile/request-scope";
import type { HttpProtectionOptions } from "./types";

/** Enforce actual bytes even when Content-Length is missing or false; parsing receives the bounded body once. */
export function createBodyGuard(
  options: HttpProtectionOptions = {}
): (request: Request) => Promise<Result<Request, string>> {
  const maxBytes = options.maxBodyBytes ?? 10 * 1024 * 1024;
  if (maxBytes !== false && (!Number.isSafeInteger(maxBytes) || maxBytes < 1)) {
    throw new Error("maxBodyBytes must be positive or false");
  }
  return async (request: Request) => {
    if (maxBytes === false || !request.body) {
      return Ok(request);
    }
    const declared = request.headers.get("content-length");
    if (declared && Number(declared) > maxBytes) {
      return Err("Request body exceeds maxBodyBytes");
    }
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    const read = await safeTry(async () => {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) {
          break;
        }
        bytes += chunk.value.byteLength;
        if (bytes > maxBytes) {
          safeTry(() => reader.cancel());
          return Err("Request body exceeds maxBodyBytes");
        }
        chunks.push(chunk.value);
      }
      const body = new Uint8Array(bytes);
      let offset = 0;
      for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return Ok(new Request(request, { body }));
    });
    reader.releaseLock();
    return read;
  };
}

/** Establish request correlation and lifecycle tracking before either HTTP adapter runs. */
export function createHttpBoundary(
  options: HttpProtectionOptions = {},
  lifecycle?: NileLifecycle
) {
  const guard = createBodyGuard(options);
  return async (
    request: Request,
    next: (request: Request) => Promise<Response>
  ): Promise<Response> => {
    const requestId = createRequestId(request.headers.get("x-request-id"));
    const admission = lifecycle?.enter(request.signal);
    if (admission?.isErr) {
      return Response.json(
        { status: false, message: "Nile is shutting down", data: {} },
        { status: 503 }
      );
    }
    const result = await safeTry(() =>
      runInRequestScope(
        {
          sessions: {},
          admissionSignal: admission?.value.signal,
          execution: {
            requestId,
            transport: "rest",
            signal: admission?.value.signal ?? request.signal,
            clientKey: resolveClientAddress(request, options),
            headers: request.headers,
          },
        },
        async () => {
          const checked = await guard(request);
          if (checked.isErr) {
            return Response.json(
              { status: false, message: checked.error, data: {} },
              { status: 413 }
            );
          }
          return next(checked.value);
        }
      )
    );
    admission?.value.finish();
    const response = result.isOk
      ? result.value
      : Response.json(
          { status: false, message: "Internal server error", data: {} },
          { status: 500 }
        );
    // Copy headers when the application returns an immutable upstream response.
    const headers = new Headers(response.headers);
    headers.set("x-request-id", requestId);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}
