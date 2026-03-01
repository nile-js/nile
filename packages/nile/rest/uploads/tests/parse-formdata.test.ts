import { describe, expect, it } from "vitest";
import {
  collectFiles,
  detectMixedKeys,
  enforceActionContentType,
  handleFormDataRequest,
  parseBodyToStructured,
  parseFormData,
  parseFormDataFlat,
} from "../parse-formdata";
import type { UploadsConfig } from "../types";

// --- Helpers ---

function createTestFile(name: string, size: number, type: string): File {
  const content = new Uint8Array(size);
  return new File([content], name, { type });
}

/** Create a mock Hono-like context with parseBody that returns the given record */
function createMockContext(body: Record<string, unknown>) {
  return {
    req: {
      parseBody: async (_opts: { all: true }) => body,
    },
  };
}

/** Create a mock context that throws on parseBody */
function createFailingContext(errorMessage: string) {
  return {
    req: {
      parseBody: (_opts: { all: true }): Promise<Record<string, unknown>> => {
        return Promise.reject(new Error(errorMessage));
      },
    },
  };
}

// --- collectFiles ---

describe("collectFiles", () => {
  it("returns empty array for empty FormData", () => {
    const fd = new FormData();
    expect(collectFiles(fd)).toEqual([]);
  });

  it("ignores string values", () => {
    const fd = new FormData();
    fd.append("name", "Alice");
    fd.append("role", "admin");
    expect(collectFiles(fd)).toEqual([]);
  });

  it("collects File objects", () => {
    const fd = new FormData();
    const file = createTestFile("a.png", 100, "image/png");
    fd.append("avatar", file);
    const result = collectFiles(fd);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("a.png");
  });

  it("collects only files from mixed entries", () => {
    const fd = new FormData();
    fd.append("name", "Alice");
    const f1 = createTestFile("a.png", 100, "image/png");
    const f2 = createTestFile("b.pdf", 200, "application/pdf");
    fd.append("file1", f1);
    fd.append("file2", f2);
    fd.append("desc", "some text");
    const result = collectFiles(fd);
    expect(result).toHaveLength(2);
    expect(result.map((f) => f.name)).toEqual(["a.png", "b.pdf"]);
  });
});

// --- detectMixedKeys ---

describe("detectMixedKeys", () => {
  it("returns empty array when no conflicts", () => {
    const fd = new FormData();
    fd.append("name", "Alice");
    fd.append("avatar", createTestFile("a.png", 100, "image/png"));
    expect(detectMixedKeys(fd)).toEqual([]);
  });

  it("detects key used for both file and string", () => {
    const fd = new FormData();
    fd.append("doc", "metadata");
    fd.append("doc", createTestFile("doc.pdf", 100, "application/pdf"));
    const conflicts = detectMixedKeys(fd);
    expect(conflicts).toEqual(["doc"]);
  });

  it("always skips the action key", () => {
    const fd = new FormData();
    fd.append("action", "upload");
    fd.append("action", createTestFile("x.png", 50, "image/png"));
    expect(detectMixedKeys(fd)).toEqual([]);
  });

  it("reports multiple conflicting keys", () => {
    const fd = new FormData();
    fd.append("alpha", "text");
    fd.append("alpha", createTestFile("a.png", 10, "image/png"));
    fd.append("beta", "text");
    fd.append("beta", createTestFile("b.png", 10, "image/png"));
    const conflicts = detectMixedKeys(fd);
    expect(conflicts).toContain("alpha");
    expect(conflicts).toContain("beta");
    expect(conflicts).toHaveLength(2);
  });
});

// --- parseFormData (structured mode) ---

describe("parseFormData", () => {
  it("separates fields and files", () => {
    const fd = new FormData();
    fd.append("name", "Alice");
    fd.append("avatar", createTestFile("a.png", 100, "image/png"));
    const result = parseFormData(fd);
    expect(result.fields).toEqual({ name: "Alice" });
    expect(result.files.avatar).toBeInstanceOf(File);
  });

  it("skips the action key", () => {
    const fd = new FormData();
    fd.append("action", "createUser");
    fd.append("name", "Bob");
    const result = parseFormData(fd);
    expect(result.fields).toEqual({ name: "Bob" });
    expect(result.files).toEqual({});
  });

  it("keeps single values as-is", () => {
    const fd = new FormData();
    const file = createTestFile("doc.pdf", 50, "application/pdf");
    fd.append("title", "My Doc");
    fd.append("doc", file);
    const result = parseFormData(fd);
    expect(typeof result.fields.title).toBe("string");
    expect(result.files.doc).toBeInstanceOf(File);
    expect(Array.isArray(result.files.doc)).toBe(false);
  });

  it("aggregates duplicate file keys into arrays", () => {
    const fd = new FormData();
    fd.append("photos", createTestFile("a.png", 10, "image/png"));
    fd.append("photos", createTestFile("b.png", 20, "image/png"));
    fd.append("photos", createTestFile("c.png", 30, "image/png"));
    const result = parseFormData(fd);
    expect(Array.isArray(result.files.photos)).toBe(true);
    expect((result.files.photos as File[]).length).toBe(3);
  });

  it("aggregates duplicate string keys into arrays", () => {
    const fd = new FormData();
    fd.append("tags", "red");
    fd.append("tags", "blue");
    const result = parseFormData(fd);
    expect(result.fields.tags).toEqual(["red", "blue"]);
  });
});

// --- parseFormDataFlat ---

describe("parseFormDataFlat", () => {
  it("returns success when no conflicts", () => {
    const fd = new FormData();
    fd.append("name", "Alice");
    fd.append("avatar", createTestFile("a.png", 100, "image/png"));
    const result = parseFormDataFlat(fd);
    expect(result.status).toBe(true);
    expect(result.data?.fields).toEqual({ name: "Alice" });
    expect(result.data?.files.avatar).toBeInstanceOf(File);
  });

  it("returns failure on mixed key types", () => {
    const fd = new FormData();
    fd.append("doc", "metadata");
    fd.append("doc", createTestFile("doc.pdf", 100, "application/pdf"));
    const result = parseFormDataFlat(fd);
    expect(result.status).toBe(false);
    expect(result.message).toBe("mixed key types not allowed");
    expect(result.errorData?.error_category).toBe("validation");
    expect(result.errorData?.conflicts).toEqual(["doc"]);
    expect(result.errorData?.hint).toBeDefined();
  });
});

// --- parseBodyToStructured ---

describe("parseBodyToStructured", () => {
  it("returns structured payload on success", async () => {
    const file = createTestFile("a.png", 100, "image/png");
    const ctx = createMockContext({ name: "Alice", avatar: file });
    const result = await parseBodyToStructured(ctx);
    expect(result.status).toBe(true);
    expect(result.data?.fields).toEqual({ name: "Alice" });
    expect(result.data?.files.avatar).toBeInstanceOf(File);
  });

  it("handles array of files under same key", async () => {
    const f1 = createTestFile("a.png", 10, "image/png");
    const f2 = createTestFile("b.png", 20, "image/png");
    const ctx = createMockContext({ photos: [f1, f2] });
    const result = await parseBodyToStructured(ctx);
    expect(result.status).toBe(true);
    expect(Array.isArray(result.data?.files.photos)).toBe(true);
    expect((result.data?.files.photos as File[]).length).toBe(2);
  });

  it("handles array of strings under same key", async () => {
    const ctx = createMockContext({ tags: ["red", "blue"] });
    const result = await parseBodyToStructured(ctx);
    expect(result.status).toBe(true);
    expect(result.data?.fields.tags).toEqual(["red", "blue"]);
  });

  it("detects mixed types in arrays", async () => {
    const file = createTestFile("a.png", 10, "image/png");
    const ctx = createMockContext({ doc: [file, "metadata"] });
    const result = await parseBodyToStructured(ctx);
    expect(result.status).toBe(false);
    expect(result.message).toBe("mixed key types not allowed");
    expect(result.errorData?.conflicts).toEqual(["doc"]);
  });

  it("skips the action key", async () => {
    const ctx = createMockContext({ action: "createUser", name: "Bob" });
    const result = await parseBodyToStructured(ctx);
    expect(result.status).toBe(true);
    expect(result.data?.fields).toEqual({ name: "Bob" });
    expect("action" in (result.data?.fields ?? {})).toBe(false);
  });

  it("returns parsing error on thrown exception", async () => {
    const ctx = createFailingContext("network failure");
    const result = await parseBodyToStructured(ctx);
    expect(result.status).toBe(false);
    expect(result.message).toBe("failed to parse request body");
    expect(result.errorData?.error_category).toBe("parsing");
    expect(result.errorData?.error).toBe("network failure");
  });
});

// --- enforceActionContentType ---

describe("enforceActionContentType", () => {
  it("passes when enforceContentType is false", () => {
    const action = {
      isSpecial: { contentType: "multipart/form-data" as const },
    };
    const result = enforceActionContentType(action, "application/json", false);
    expect(result.status).toBe(true);
  });

  it("passes when action has no isSpecial", () => {
    const action = {};
    const result = enforceActionContentType(action, "application/json", true);
    expect(result.status).toBe(true);
  });

  it("passes when action has no isSpecial.contentType", () => {
    const action = { isSpecial: {} as { contentType: string } };
    const result = enforceActionContentType(action, "text/plain", true);
    expect(result.status).toBe(true);
  });

  it("passes when content-type matches", () => {
    const action = {
      isSpecial: { contentType: "multipart/form-data" as const },
    };
    const result = enforceActionContentType(
      action,
      "multipart/form-data; boundary=abc",
      true
    );
    expect(result.status).toBe(true);
  });

  it("returns 415 when content-type does not match", () => {
    const action = {
      isSpecial: { contentType: "multipart/form-data" as const },
    };
    const result = enforceActionContentType(action, "application/json", true);
    expect(result.status).toBe(false);
    expect(result.statusCode).toBe(415);
    expect(result.message).toBe("unsupported content type");
    expect(result.data?.error_category).toBe("validation");
    expect(result.data?.expected).toBe("multipart/form-data");
    expect(result.data?.received).toBe("application/json");
  });

  it("matches case-insensitively", () => {
    const action = {
      isSpecial: { contentType: "Multipart/Form-Data" as const },
    };
    const result = enforceActionContentType(
      action,
      "MULTIPART/FORM-DATA; boundary=xyz",
      true
    );
    expect(result.status).toBe(true);
  });
});

// --- handleFormDataRequest ---

describe("handleFormDataRequest", () => {
  const validConfig: UploadsConfig = {
    limits: {
      maxFiles: 5,
      maxFileSize: 10 * 1024 * 1024,
      maxTotalSize: 20 * 1024 * 1024,
    },
    allow: {
      mimeTypes: ["image/png", "image/jpeg", "application/pdf"],
      extensions: [".png", ".jpg", ".jpeg", ".pdf"],
    },
  };

  it("returns structured payload for valid files", async () => {
    const file = createTestFile("photo.png", 500, "image/png");
    const ctx = createMockContext({ title: "My Upload", photo: file });
    const result = await handleFormDataRequest(ctx, validConfig);
    expect(result.status).toBe(true);
    expect(result.data?.fields).toEqual({ title: "My Upload" });
    expect(result.data?.files.photo).toBeInstanceOf(File);
  });

  it("propagates parse failure", async () => {
    const ctx = createFailingContext("corrupt body");
    const result = await handleFormDataRequest(ctx, validConfig);
    expect(result.status).toBe(false);
    expect(result.message).toBe("failed to parse request body");
    expect(result.errorData?.error_category).toBe("parsing");
  });

  it("returns validation failure for disallowed file type", async () => {
    const file = createTestFile("script.exe", 500, "application/x-msdownload");
    const ctx = createMockContext({ file });
    const result = await handleFormDataRequest(ctx, validConfig);
    expect(result.status).toBe(false);
    expect(result.message).toBe("file type not allowed");
    expect(result.errorData?.error_category).toBe("validation");
  });

  it("returns validation failure for oversized file", async () => {
    const bigFile = createTestFile("huge.png", 11 * 1024 * 1024, "image/png");
    const ctx = createMockContext({ file: bigFile });
    const result = await handleFormDataRequest(ctx, validConfig);
    expect(result.status).toBe(false);
    expect(result.message).toBe("upload limit exceeded");
    expect(result.statusCode).toBeUndefined(); // validateFiles doesn't set statusCode
  });

  it("succeeds with empty files (fields only)", async () => {
    const ctx = createMockContext({ name: "Alice", role: "admin" });
    const result = await handleFormDataRequest(ctx, validConfig);
    expect(result.status).toBe(true);
    expect(result.data?.files).toEqual({});
  });

  it("respects custom config limits", async () => {
    const strictConfig: UploadsConfig = {
      limits: { maxFiles: 1 },
      allow: {
        mimeTypes: ["image/png"],
        extensions: [".png"],
      },
    };
    const f1 = createTestFile("a.png", 100, "image/png");
    const f2 = createTestFile("b.png", 100, "image/png");
    const ctx = createMockContext({ photos: [f1, f2] });
    const result = await handleFormDataRequest(ctx, strictConfig);
    expect(result.status).toBe(false);
    expect(result.message).toBe("upload limit exceeded");
  });

  it("defaults uploadMode to flat (uses parseBodyToStructured)", async () => {
    const file = createTestFile("a.png", 100, "image/png");
    const ctx = createMockContext({ name: "test", avatar: file });
    // Calling without explicit uploadMode — should still work
    const result = await handleFormDataRequest(ctx, validConfig);
    expect(result.status).toBe(true);
    expect(result.data?.fields.name).toBe("test");
  });

  it("propagates mixed-key conflict from parseBodyToStructured", async () => {
    const file = createTestFile("a.png", 10, "image/png");
    const ctx = createMockContext({ doc: [file, "some text"] });
    const result = await handleFormDataRequest(ctx, validConfig);
    expect(result.status).toBe(false);
    expect(result.message).toBe("mixed key types not allowed");
    expect(result.errorData?.error_category).toBe("validation");
  });
});
