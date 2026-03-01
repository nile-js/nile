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

    const result = await sendNileRequest(config, "execute", "users", "create", { name: "Alice" });

    expect(result.error).toBeNull();
    expect(result.data).toEqual({ id: 1 });

    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe("http://localhost:8000/api/services");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>)["Content-Type"]).toBe("application/json");

    const body = JSON.parse(init?.body as string);
    expect(body).toEqual({
      intent: "execute",
      service: "users",
      action: "create",
      payload: { name: "Alice" },
    });
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

    await sendNileRequest(config, "execute", "svc", "act", {}, {
      headers: { "X-Custom": "value" },
    });

    const [, init] = mockFetch.mock.calls[0]!;
    expect((init?.headers as Record<string, string>)["X-Custom"]).toBe("value");
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
      mockFetchResponse({ status: true, message: "ok", data: { uploaded: true } })
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
    const headers = init?.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBeUndefined();
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
      mockFetchResponse({ status: false, message: "File too large", data: { maxSize: 5 } })
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
      headers: { "Content-Type": "application/json", Authorization: "Bearer tok" },
    };

    const file = new File(["x"], "test.txt");
    await sendUploadRequest(configWithCT, "svc", "act", { file });

    const [, init] = mockFetch.mock.calls[0]!;
    const headers = init?.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBeUndefined();
    expect(headers["Authorization"]).toBe("Bearer tok");
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
    const headers = init?.headers as Record<string, string>;
    expect(headers["X-Request-Id"]).toBe("abc123");
  });
});
