export const BUN_FETCH_DOCUMENTATION =
  "https://bun.sh/docs/runtime/networking/fetch";

const CONTENT_LENGTH = /^[0-9]+$/;

/** Use native buffering only when HTTP framing already bounds the undecoded body. */
async function readFramedResponse({
  response,
  controller,
  maxResponseBytes,
  progress,
}) {
  const rawLength = response.headers.get("content-length");
  const encoding = response.headers.get("content-encoding");
  if (
    rawLength === null ||
    !CONTENT_LENGTH.test(rawLength) ||
    (encoding !== null && encoding.trim().toLowerCase() !== "identity") ||
    response.headers.has("transfer-encoding")
  )
    return null;
  const length = Number(rawLength);
  if (!Number.isSafeInteger(length)) return null;
  if (length > maxResponseBytes) {
    controller.abort(Error("Response exceeds limit"));
    return {
      status: false,
      kind: "oversized",
      message: "Response exceeds limit",
    };
  }
  // Native HTTP/1.1 framing stops at Content-Length; decompression is disabled.
  // Thus arrayBuffer cannot collect an unbounded chunked or expanded body here.
  const bytes = await response.arrayBuffer();
  progress.responseBytes = bytes.byteLength;
  if (bytes.byteLength !== length || bytes.byteLength > maxResponseBytes)
    throw Error("Response does not match its bounded Content-Length");
  return {
    status: true,
    statusCode: response.status,
    body: Buffer.from(bytes).toString("utf8"),
  };
}

/** Consume all accepted bodies; unknown framing retains incremental byte-limit checks. */
async function readResponse({
  response,
  controller,
  maxResponseBytes,
  progress,
}) {
  const framed = await readFramedResponse({
    response,
    controller,
    maxResponseBytes,
    progress,
  });
  if (framed) return framed;
  const chunks = [];
  const reader = response.body?.getReader();
  if (reader) {
    let done = false;
    while (!done) {
      const part = await reader.read();
      done = part.done;
      if (done) continue;
      progress.responseBytes += part.value.byteLength;
      if (progress.responseBytes > maxResponseBytes) {
        controller.abort(Error("Response exceeds limit"));
        await reader.cancel().then(undefined, () => {});
        return {
          status: false,
          kind: "oversized",
          message: "Response exceeds limit",
        };
      }
      chunks.push(part.value);
    }
  }
  return {
    status: true,
    statusCode: response.status,
    body: Buffer.concat(chunks, progress.responseBytes).toString("utf8"),
  };
}

/** Use native Bun fetch without application retries; its shared idle pool lasts until process exit. */
export function createBunHttpClient({
  concurrency,
  timeoutSeconds,
  maxResponseBytes = 65536,
}) {
  if (!process.versions.bun) throw Error("Native Bun HTTP client requires Bun");
  if (
    !Number.isSafeInteger(concurrency) ||
    concurrency < 1 ||
    concurrency > 256
  )
    throw Error(
      "Native Bun fetch requires concurrency 1..256 without environment overrides"
    );
  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0)
    throw Error("timeoutSeconds must be finite and positive");
  if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 1)
    throw Error("maxResponseBytes must be a positive safe integer");
  const pending = new Set();
  let closed = false;
  return {
    request(exchange) {
      if (closed || pending.size >= concurrency)
        return Promise.resolve({
          status: false,
          kind: "network",
          message: closed ? "Client is closed" : "Client concurrency exceeded",
          responseBytes: 0,
        });
      const controller = new AbortController();
      pending.add(controller);
      const progress = { responseBytes: 0 };
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort(Error("Request deadline exceeded"));
      }, timeoutSeconds * 1000);
      const execute = async () => {
        const response = await fetch(exchange.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "content-length": String(Buffer.byteLength(exchange.body)),
            accept: "application/json",
            "accept-encoding": "identity",
          },
          body: exchange.body,
          signal: controller.signal,
          redirect: "manual",
          keepalive: true,
          decompress: false,
          proxy: false,
        });
        return readResponse({
          response,
          controller,
          maxResponseBytes,
          progress,
        });
      };
      return execute()
        .then(
          (result) => ({ ...result, responseBytes: progress.responseBytes }),
          (error) => ({
            status: false,
            kind: timedOut ? "timeout" : "network",
            message: error instanceof Error ? error.message : String(error),
            responseBytes: progress.responseBytes,
          })
        )
        .finally(() => {
          clearTimeout(timer);
          pending.delete(controller);
        });
    },
    close() {
      closed = true;
      pending.forEach((controller) => controller.abort(Error("Client closed")));
    },
  };
}
