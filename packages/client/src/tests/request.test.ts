import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendNileRequest, sendUploadRequest } from "../request.js";
import type { NileClientConfig } from "../types.js";

const config: NileClientConfig = { baseUrl: "http://localhost:8000/api" };

/** Helper to create a mock fetch response */
const mockFetchResponse = (body: unknown, ok = true) =>
  Promise.resolve({
    ok,
    json: () => Promise.resolve(body),
  } as Response);

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.restoreAllMocks();
});

// --- sendNileRequest ---

describe("sendNileRequest", () => {
  it("should send JSON POST to /services with correct body", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockReturnValue(
      mockFetchResponse({ status: true, message: "ok", data: { id: 1 } })
    );

    const result = await sendNileRequest(config, "execute", "users", "create", {
      name: "Alice",
    });

    expect(result.error).toBeNull();
    expect(result.data).toEqual({ id: 1 });

    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe("http://localhost:8000/api/services");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Content-Type")).toBe(
      "application/json"
    );

    const body = JSON.parse(init?.body as string);
    expect(body).toEqual({
      intent: "execute",
      service: "users",
      action: "create",
      payload: { name: "Alice" },
    });
  });

  it("should return an Ok result with the action data as value", async () => {
    vi.mocked(fetch).mockReturnValue(
      mockFetchResponse({ status: true, message: "ok", data: { id: 1 } })
    );

    const result = await sendNileRequest(
      config,
      "execute",
      "users",
      "create",
      {}
    );

    expect(result.isOk).toBe(true);
    expect(result.isErr).toBe(false);
    expect(result.value).toEqual({ id: 1 });
    expect(result.error).toBeNull();
  });

  it("should expose the server's success message", async () => {
    vi.mocked(fetch).mockReturnValue(
      mockFetchResponse({
        status: true,
        message: "Project created",
        data: { id: 1 },
      })
    );

    const result = await sendNileRequest(
      config,
      "execute",
      "projects",
      "create",
      {}
    );

    expect(result.isOk && result.message).toBe("Project created");
  });

  it("should return an Err result with the server's details", async () => {
    vi.mocked(fetch).mockReturnValue(
      mockFetchResponse({
        status: false,
        message: "Invalid input",
        data: { issues: ["name is required"] },
      })
    );

    const result = await sendNileRequest(
      config,
      "execute",
      "users",
      "create",
      {}
    );

    expect(result.isErr).toBe(true);
    expect(result.isOk).toBe(false);
    expect(result.value).toBeNull();
    if (result.isErr) {
      expect(result.error).toBe("Invalid input");
      expect(result.details).toEqual({ issues: ["name is required"] });
    }
  });

  it("should return an Err result without details on network failure", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("Network error"));

    const result = await sendNileRequest(config, "execute", "x", "y", {});

    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error).toBe("Network error");
      expect(result.details).toBeNull();
    }
  });

  it("should return error when server returns status: false", async () => {
    vi.mocked(fetch).mockReturnValue(
      mockFetchResponse({ status: false, message: "Not found", data: null })
    );

    const result = await sendNileRequest(config, "execute", "x", "y", {});
    expect(result.error).toBe("Not found");
  });

  it("should return error on network failure", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("Network error"));

    const result = await sendNileRequest(config, "execute", "x", "y", {});
    expect(result.error).toBe("Network error");
    expect(result.data).toBeNull();
  });

  it("should pass named fetchOptions through to fetch", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockReturnValue(
      mockFetchResponse({ status: true, message: "ok", data: {} })
    );

    await sendNileRequest(
      config,
      "execute",
      "svc",
      "act",
      {},
      {
        headers: { "X-Custom": "value" },
      }
    );

    const [, init] = mockFetch.mock.calls[0]!;
    expect(new Headers(init?.headers).get("X-Custom")).toBe("value");
  });

  it("should default null payload to empty object", async () => {
    vi.mocked(fetch).mockReturnValue(
      mockFetchResponse({ status: true, message: "ok", data: {} })
    );

    await sendNileRequest(config, "explore", "svc", "act", null);

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const body = JSON.parse(init?.body as string);
    expect(body.payload).toEqual({});
  });
});

// --- sendUploadRequest ---

describe("sendUploadRequest", () => {
  it("should send FormData POST to /services", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockReturnValue(
      mockFetchResponse({
        status: true,
        message: "ok",
        data: { uploaded: true },
      })
    );

    const file = new File(["hello"], "test.txt", { type: "text/plain" });
    const result = await sendUploadRequest(
      config,
      "uploads",
      "submit",
      { document: file },
      { title: "My Doc" }
    );

    expect(result.error).toBeNull();
    expect(result.data).toEqual({ uploaded: true });

    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe("http://localhost:8000/api/services");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBeInstanceOf(FormData);

    // Verify Content-Type is NOT set (let runtime handle multipart boundary)
    const headers = new Headers(init?.headers);
    expect(headers.get("Content-Type")).toBeNull();
  });

  it("should include RPC routing fields in FormData", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockReturnValue(
      mockFetchResponse({ status: true, message: "ok", data: {} })
    );

    const file = new File(["x"], "x.txt");
    await sendUploadRequest(config, "media", "upload", { file });

    const [, init] = mockFetch.mock.calls[0]!;
    const fd = init?.body as FormData;
    expect(fd.get("intent")).toBe("execute");
    expect(fd.get("service")).toBe("media");
    expect(fd.get("action")).toBe("upload");
  });

  it("should return error when server returns status: false", async () => {
    vi.mocked(fetch).mockReturnValue(
      mockFetchResponse({
        status: false,
        message: "File too large",
        data: { maxSize: 5 },
      })
    );

    const file = new File(["x".repeat(1000)], "big.bin");
    const result = await sendUploadRequest(config, "media", "upload", { file });

    expect(result.error).toBe("File too large");
  });

  it("should return error on network failure", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("Connection refused"));

    const file = new File(["x"], "test.txt");
    const result = await sendUploadRequest(config, "svc", "act", { file });

    expect(result.error).toBe("Connection refused");
    expect(result.data).toBeNull();
  });

  it("should strip Content-Type from config.headers", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockReturnValue(
      mockFetchResponse({ status: true, message: "ok", data: {} })
    );

    const configWithCT: NileClientConfig = {
      ...config,
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer tok",
      },
    };

    const file = new File(["x"], "test.txt");
    await sendUploadRequest(configWithCT, "svc", "act", { file });

    const [, init] = mockFetch.mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(headers.get("Content-Type")).toBeNull();
    expect(headers.get("Authorization")).toBe("Bearer tok");
  });

  it("should pass named fetchOptions through to fetch", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockReturnValue(
      mockFetchResponse({ status: true, message: "ok", data: {} })
    );

    const file = new File(["x"], "test.txt");
    await sendUploadRequest(config, "svc", "act", { file }, undefined, {
      headers: { "X-Request-Id": "abc123" },
    });

    const [, init] = mockFetch.mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(headers.get("X-Request-Id")).toBe("abc123");
  });
});

describe("current Nile HTTP contract and transport controls", () => {
  it("merges global and per-call Headers without losing JSON Content-Type", async () => {
    vi.mocked(fetch).mockReturnValue(
      mockFetchResponse({
        status: true,
        message: "Action completed.",
        data: {},
      })
    );
    await sendNileRequest(
      {
        ...config,
        baseUrl: `${config.baseUrl}/`,
        headers: {
          Authorization: "Bearer session",
          "X-Team": "original",
        },
      },
      "execute",
      "tasks",
      "create",
      {},
      {
        headers: new Headers({ "x-team": "override", "x-trace": "trace" }),
      }
    );
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(url).toBe(`${config.baseUrl}/services`);
    expect(headers.get("authorization")).toBe("Bearer session");
    expect(headers.get("x-team")).toBe("override");
    expect(headers.get("x-trace")).toBe("trace");
    expect(headers.get("content-type")).toBe("application/json");
  });

  it("strips multipart content types case-insensitively while preserving merged headers", async () => {
    vi.mocked(fetch).mockReturnValue(
      mockFetchResponse({
        status: true,
        message: "Action completed.",
        data: {},
      })
    );
    await sendUploadRequest(
      {
        ...config,
        headers: {
          "content-type": "application/json",
          Authorization: "Bearer session",
        },
      },
      "files",
      "upload",
      {},
      undefined,
      {
        headers: [
          ["CONTENT-TYPE", "wrong"],
          ["x-trace", "trace"],
        ],
      }
    );
    const headers = new Headers(vi.mocked(fetch).mock.calls[0]![1]?.headers);
    expect(headers.has("content-type")).toBe(false);
    expect(headers.get("authorization")).toBe("Bearer session");
    expect(headers.get("x-trace")).toBe("trace");
  });

  it("preserves prettified validation errors and unique diagnostic data", async () => {
    const details = {
      errorCode: "jN8sQ4tV2pLm",
      issues: [{ path: "title", message: "Title is required" }],
    };
    const message = "✖ Title is required\n  → at title";
    vi.mocked(fetch).mockReturnValue(
      mockFetchResponse({ status: false, message: message, data: details })
    );
    const result = await sendNileRequest(
      config,
      "execute",
      "tasks",
      "create",
      {}
    );
    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error).toBe(message);
      expect(result.details).toEqual(details);
    }
  });

  it("keeps the timeout active until the response body is read", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(fetch).mockImplementation(
        async (_url, init) =>
          ({
            json: () =>
              new Promise((_resolve, reject) => {
                init?.signal?.addEventListener(
                  "abort",
                  () => reject(new DOMException("Aborted", "AbortError")),
                  { once: true }
                );
              }),
          }) as Response
      );
      const pending = sendNileRequest(
        config,
        "execute",
        "tasks",
        "create",
        {},
        { timeout: 10 }
      );
      await vi.advanceTimersByTimeAsync(11);
      const result = await pending;
      expect(result.error).toBe("Action timed out.");
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("honors caller cancellation and removes pending timers on failure", async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      vi.mocked(fetch).mockImplementation(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true }
            );
          })
      );
      const pending = sendNileRequest(
        config,
        "execute",
        "tasks",
        "create",
        {},
        { signal: controller.signal }
      );
      controller.abort();
      expect((await pending).error).toBe("Action cancelled.");
      expect(vi.getTimerCount()).toBe(0);
      vi.mocked(fetch).mockRejectedValue(new Error("Offline"));
      expect(
        (await sendNileRequest(config, "execute", "tasks", "create", {})).error
      ).toBe("Offline");
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns a failure for a non-Nile JSON response", async () => {
    vi.mocked(fetch).mockReturnValue(
      mockFetchResponse({ error: "Proxy failure" })
    );
    expect(
      (await sendNileRequest(config, "execute", "tasks", "create", {})).error
    ).toBe("Invalid Nile action response.");
  });
});
