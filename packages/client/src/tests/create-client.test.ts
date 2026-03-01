import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createNileClient } from "../create-client.js";
import type { NileClientConfig } from "../types.js";

const config: NileClientConfig = { baseUrl: "http://localhost:8000/api" };

const mockFetchResponse = (body: unknown) =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve(body),
  } as Response);

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createNileClient", () => {
  it("should return an object with invoke, explore, schema, and upload methods", () => {
    const client = createNileClient(config);
    expect(typeof client.invoke).toBe("function");
    expect(typeof client.explore).toBe("function");
    expect(typeof client.schema).toBe("function");
    expect(typeof client.upload).toBe("function");
  });
});

describe("client.invoke", () => {
  it("should send execute intent with named fetchOptions", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockReturnValue(
      mockFetchResponse({ status: true, message: "ok", data: { id: 1 } })
    );

    const client = createNileClient(config);
    const result = await client.invoke({
      service: "users",
      action: "create",
      payload: { name: "Alice" },
      fetchOptions: { headers: { "X-Trace": "abc" } },
    });

    expect(result.error).toBeNull();
    expect(result.data).toEqual({ id: 1 });

    const [, init] = mockFetch.mock.calls[0]!;
    const body = JSON.parse(init?.body as string);
    expect(body.intent).toBe("execute");
    expect(body.service).toBe("users");
    expect((init?.headers as Record<string, string>)["X-Trace"]).toBe("abc");
  });
});

describe("client.explore", () => {
  it("should send explore intent with named fetchOptions", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockReturnValue(
      mockFetchResponse({ status: true, message: "ok", data: { services: [] } })
    );

    const client = createNileClient(config);
    const result = await client.explore({
      service: "*",
      action: "*",
      fetchOptions: { headers: { Authorization: "Bearer tok" } },
    });

    expect(result.error).toBeNull();

    const [, init] = mockFetch.mock.calls[0]!;
    const body = JSON.parse(init?.body as string);
    expect(body.intent).toBe("explore");
    expect((init?.headers as Record<string, string>)["Authorization"]).toBe("Bearer tok");
  });
});

describe("client.schema", () => {
  it("should send schema intent with named fetchOptions", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockReturnValue(
      mockFetchResponse({ status: true, message: "ok", data: { schema: {} } })
    );

    const client = createNileClient(config);
    await client.schema({
      service: "users",
      action: "create",
    });

    const [, init] = mockFetch.mock.calls[0]!;
    const body = JSON.parse(init?.body as string);
    expect(body.intent).toBe("schema");
    expect(body.service).toBe("users");
    expect(body.action).toBe("create");
  });
});

describe("client.upload", () => {
  it("should send multipart form-data with files", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockReturnValue(
      mockFetchResponse({ status: true, message: "ok", data: { fileId: "abc" } })
    );

    const client = createNileClient(config);
    const file = new File(["content"], "doc.pdf", { type: "application/pdf" });

    const result = await client.upload({
      service: "documents",
      action: "upload",
      files: { document: file },
      fields: { category: "invoices" },
    });

    expect(result.error).toBeNull();
    expect(result.data).toEqual({ fileId: "abc" });

    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe("http://localhost:8000/api/services");
    expect(init?.body).toBeInstanceOf(FormData);

    const fd = init?.body as FormData;
    expect(fd.get("intent")).toBe("execute");
    expect(fd.get("service")).toBe("documents");
    expect(fd.get("action")).toBe("upload");
    expect(fd.get("category")).toBe("invoices");
    expect((fd.get("document") as File).name).toBe("doc.pdf");
  });

  it("should support multiple files under the same key", async () => {
    vi.mocked(fetch).mockReturnValue(
      mockFetchResponse({ status: true, message: "ok", data: {} })
    );

    const client = createNileClient(config);
    const files = [
      new File(["a"], "a.png", { type: "image/png" }),
      new File(["b"], "b.png", { type: "image/png" }),
    ];

    await client.upload({
      service: "gallery",
      action: "batch-upload",
      files: { images: files },
    });

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const fd = init?.body as FormData;
    const entries = fd.getAll("images");
    expect(entries).toHaveLength(2);
    expect((entries[0] as File).name).toBe("a.png");
    expect((entries[1] as File).name).toBe("b.png");
  });

  it("should pass named fetchOptions through", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockReturnValue(
      mockFetchResponse({ status: true, message: "ok", data: {} })
    );

    const client = createNileClient(config);
    const file = new File(["x"], "test.txt");

    await client.upload({
      service: "svc",
      action: "act",
      files: { file },
      fetchOptions: { headers: { "X-Request-Id": "req-123" } },
    });

    const [, init] = mockFetch.mock.calls[0]!;
    const headers = init?.headers as Record<string, string>;
    expect(headers["X-Request-Id"]).toBe("req-123");
  });

  it("should not set Content-Type header", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockReturnValue(
      mockFetchResponse({ status: true, message: "ok", data: {} })
    );

    const client = createNileClient(config);
    const file = new File(["x"], "test.txt");

    await client.upload({
      service: "svc",
      action: "act",
      files: { file },
    });

    const [, init] = mockFetch.mock.calls[0]!;
    const headers = init?.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBeUndefined();
  });
});
