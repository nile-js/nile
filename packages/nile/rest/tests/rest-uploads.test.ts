/**
 * Integration tests for the multipart form-data path through the REST layer.
 * Tests the full flow: content-type detection → routing extraction → file parsing
 * → validation → intent dispatch, all through Hono's app.request().
 */

import { Ok } from "slang-ts";
import { describe, expect, it } from "vitest";
import { createEngine } from "../../engine/engine";
import type { Service } from "../../engine/types";
import { createNileContext } from "../../nile/nile";
import type { ExternalResponse } from "../../nile/types";
import { createRestApp } from "../rest";
import type { RestConfig } from "../types";

// --- Fixtures ---

const mockServices: Service[] = [
  {
    name: "documents",
    description: "Document management",
    actions: [
      {
        name: "uploadDoc",
        description: "Upload a document",
        handler: (data) => Ok({ received: true, payload: data }),
        isSpecial: {
          contentType: "multipart/form-data",
          uploadMode: "structured",
        },
        accessControl: ["user"],
      },
      {
        name: "getDoc",
        description: "Get a document",
        handler: (data) => Ok({ id: data.docId }),
        accessControl: ["public"],
      },
    ],
  },
  {
    name: "images",
    description: "Image processing",
    actions: [
      {
        name: "uploadImage",
        description: "Upload an image",
        handler: (data) => Ok({ uploaded: true, data }),
        isSpecial: {
          contentType: "multipart/form-data",
          uploadMode: "flat",
        },
        accessControl: ["user"],
      },
    ],
  },
];

const baseConfig: RestConfig = {
  baseUrl: "/api/v1",
  allowedOrigins: ["http://localhost:3000"],
  enableStatus: false,
  diagnostics: false,
};

function createTestApp(overrides?: Partial<RestConfig>) {
  const engine = createEngine({ services: mockServices });
  const nileContext = createNileContext();
  const app = createRestApp({
    config: { ...baseConfig, ...overrides },
    engine,
    nileContext,
    serverName: "UploadTestServer",
    runtime: "bun",
  });
  return { app, engine, nileContext };
}

/** Create a File object for testing */
function createTestFile(name: string, size: number, type: string): File {
  const content = new Uint8Array(size);
  return new File([content], name, { type });
}

/**
 * Build a FormData body with RPC routing fields and optional files/fields.
 * Hono's app.request() accepts a Request with FormData body natively.
 */
function buildFormRequest(
  app: ReturnType<typeof createTestApp>["app"],
  params: {
    intent: string;
    service: string;
    action: string;
    files?: Array<{ key: string; file: File }>;
    fields?: Record<string, string>;
  }
) {
  const formData = new FormData();
  formData.append("intent", params.intent);
  formData.append("service", params.service);
  formData.append("action", params.action);

  if (params.fields) {
    for (const [key, value] of Object.entries(params.fields)) {
      formData.append(key, value);
    }
  }

  if (params.files) {
    for (const { key, file } of params.files) {
      formData.append(key, file);
    }
  }

  return app.request("/api/v1/services", {
    method: "POST",
    body: formData,
  });
}

// --- Tests ---

describe("REST Form-Data Path - Routing Extraction", () => {
  const { app } = createTestApp();

  it("should route form-data requests to the correct action", async () => {
    const file = createTestFile("doc.pdf", 1024, "application/pdf");
    const res = await buildFormRequest(app, {
      intent: "execute",
      service: "documents",
      action: "uploadDoc",
      files: [{ key: "document", file }],
    });
    const json = (await res.json()) as ExternalResponse;

    expect(res.status).toBe(200);
    expect(json.status).toBe(true);
    expect(json.data.received).toBe(true);
  });

  it("should reject form-data missing routing fields", async () => {
    const formData = new FormData();
    formData.append("intent", "execute");
    // missing service and action

    const res = await app.request("/api/v1/services", {
      method: "POST",
      body: formData,
    });
    const json = (await res.json()) as ExternalResponse;

    expect(res.status).toBe(400);
    expect(json.status).toBe(false);
    expect(json.message).toContain("intent");
  });

  it("should reject form-data with invalid intent", async () => {
    const formData = new FormData();
    formData.append("intent", "invalid");
    formData.append("service", "documents");
    formData.append("action", "uploadDoc");

    const res = await app.request("/api/v1/services", {
      method: "POST",
      body: formData,
    });
    const json = (await res.json()) as ExternalResponse;

    expect(res.status).toBe(400);
    expect(json.status).toBe(false);
  });

  it("should support explore intent via form-data", async () => {
    const res = await buildFormRequest(app, {
      intent: "explore",
      service: "*",
      action: "*",
    });
    const json = (await res.json()) as ExternalResponse;

    expect(res.status).toBe(200);
    expect(json.status).toBe(true);
    const result = json.data.result as Array<{ name: string }>;
    expect(result.length).toBe(2);
  });

  it("should support schema intent via form-data", async () => {
    const res = await buildFormRequest(app, {
      intent: "schema",
      service: "documents",
      action: "*",
    });
    const json = (await res.json()) as ExternalResponse;

    expect(res.status).toBe(200);
    expect(json.status).toBe(true);
  });
});

describe("REST Form-Data Path - File Upload Flow", () => {
  const { app } = createTestApp({
    uploads: {
      limits: {
        maxFiles: 3,
        maxFileSize: 5 * 1024 * 1024, // 5MB
        maxTotalSize: 10 * 1024 * 1024, // 10MB
      },
      allow: {
        mimeTypes: ["image/png", "image/jpeg", "application/pdf"],
        extensions: [".png", ".jpg", ".jpeg", ".pdf"],
      },
    },
  });

  it("should pass files through to the action handler", async () => {
    const file = createTestFile("photo.png", 2048, "image/png");
    const res = await buildFormRequest(app, {
      intent: "execute",
      service: "images",
      action: "uploadImage",
      files: [{ key: "image", file }],
    });
    const json = (await res.json()) as ExternalResponse;

    expect(res.status).toBe(200);
    expect(json.status).toBe(true);
  });

  it("should pass string fields alongside files", async () => {
    const file = createTestFile("report.pdf", 512, "application/pdf");
    const res = await buildFormRequest(app, {
      intent: "execute",
      service: "documents",
      action: "uploadDoc",
      files: [{ key: "file", file }],
      fields: { title: "Q4 Report", category: "finance" },
    });
    const json = (await res.json()) as ExternalResponse;

    expect(res.status).toBe(200);
    expect(json.status).toBe(true);
  });

  it("should reject uploads exceeding max file count", async () => {
    const files = Array.from({ length: 4 }, (_, i) => ({
      key: "docs",
      file: createTestFile(`doc${i}.pdf`, 100, "application/pdf"),
    }));
    const res = await buildFormRequest(app, {
      intent: "execute",
      service: "documents",
      action: "uploadDoc",
      files,
    });
    const json = (await res.json()) as ExternalResponse;

    expect(res.status).toBe(400);
    expect(json.status).toBe(false);
    expect(json.message).toContain("upload limit exceeded");
  });

  it("should reject files with disallowed MIME type", async () => {
    const file = createTestFile("script.exe", 100, "application/x-msdownload");
    const res = await buildFormRequest(app, {
      intent: "execute",
      service: "documents",
      action: "uploadDoc",
      files: [{ key: "file", file }],
    });
    const json = (await res.json()) as ExternalResponse;

    expect(res.status).toBe(400);
    expect(json.status).toBe(false);
    expect(json.message).toContain("file type not allowed");
  });

  it("should handle form-data with only string fields (no files)", async () => {
    const res = await buildFormRequest(app, {
      intent: "execute",
      service: "documents",
      action: "uploadDoc",
      fields: { title: "Text-only submission" },
    });
    const json = (await res.json()) as ExternalResponse;

    // No files means validation passes (empty array), action still executes
    expect(res.status).toBe(200);
    expect(json.status).toBe(true);
  });

  it("should reject zero-byte files", async () => {
    const file = createTestFile("empty.pdf", 0, "application/pdf");
    const res = await buildFormRequest(app, {
      intent: "execute",
      service: "documents",
      action: "uploadDoc",
      files: [{ key: "file", file }],
    });
    const json = (await res.json()) as ExternalResponse;

    expect(res.status).toBe(400);
    expect(json.status).toBe(false);
    expect(json.message).toContain("empty file not allowed");
  });
});

describe("REST Form-Data Path - Content-Type Enforcement", () => {
  it("should enforce content-type when config enables it", async () => {
    const { app } = createTestApp({
      uploads: { enforceContentType: true },
    });

    // getDoc action has NO isSpecial.contentType, so enforcement is skipped
    const res = await buildFormRequest(app, {
      intent: "execute",
      service: "documents",
      action: "getDoc",
      fields: { docId: "abc-123" },
    });
    const json = (await res.json()) as ExternalResponse;

    // Should still work — no contentType constraint on getDoc
    expect(res.status).toBe(200);
    expect(json.status).toBe(true);
  });

  it("should allow matching content-type for upload actions", async () => {
    const { app } = createTestApp({
      uploads: {
        enforceContentType: true,
        allow: {
          mimeTypes: ["image/png", "image/jpeg", "application/pdf"],
          extensions: [".png", ".jpg", ".jpeg", ".pdf"],
        },
      },
    });

    const file = createTestFile("photo.png", 512, "image/png");
    const res = await buildFormRequest(app, {
      intent: "execute",
      service: "images",
      action: "uploadImage",
      files: [{ key: "image", file }],
    });
    const json = (await res.json()) as ExternalResponse;

    // multipart/form-data matches isSpecial.contentType "multipart/form-data"
    expect(res.status).toBe(200);
    expect(json.status).toBe(true);
  });
});

describe("REST Form-Data Path - JSON requests still work", () => {
  const { app } = createTestApp();

  it("should still handle JSON requests normally alongside form-data support", async () => {
    const res = await app.request("/api/v1/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        intent: "explore",
        service: "*",
        action: "*",
        payload: {},
      }),
    });
    const json = (await res.json()) as ExternalResponse;

    expect(res.status).toBe(200);
    expect(json.status).toBe(true);
  });
});
