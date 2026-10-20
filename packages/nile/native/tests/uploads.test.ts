import { Ok } from "slang-ts";
import { describe, expect, it } from "vitest";
import { createEngine } from "../../engine/engine";
import type { Action } from "../../engine/types";
import { createNileContext } from "../../nile/nile";
import type { ExternalResponse } from "../../nile/types";
import { createNativeRequestContext } from "../context";
import { createNativeIntentHandlers } from "../discovery";
import type { NativeRestConfig } from "../types";
import { handleNativeFormData } from "../uploads";

/** Build native multipart bodies against the same engine used by ordinary action requests. */
function setup({
  uploads,
  action = {},
  discovery,
}: {
  uploads?: NativeRestConfig["uploads"];
  discovery?: NativeRestConfig["discovery"];
  action?: Partial<Action>;
} = {}) {
  const config: NativeRestConfig = {
    baseUrl: "/api",
    allowedOrigins: [],
    uploads,
    discovery,
  };
  const engine = createEngine({
    services: [
      {
        name: "test",
        description: "Uploads",
        actions: [
          {
            name: "main",
            description: "Upload",
            handler: (payload) => Ok(payload),
            ...action,
          },
        ],
      },
    ],
  });
  const nileContext = createNileContext();
  const handlers = createNativeIntentHandlers({ config });
  return {
    send: (
      body: FormData,
      selectCors?: Parameters<typeof handleNativeFormData>[0]["selectCors"]
    ) => {
      const request = new Request("http://localhost/api/services", {
        method: "POST",
        body,
      });
      const context = createNativeRequestContext(request);
      return handleNativeFormData({
        context,
        config,
        engine,
        nileContext,
        handlers,
        selectCors,
      });
    },
    raw: (request: Request) =>
      handleNativeFormData({
        context: createNativeRequestContext(request),
        config,
        engine,
        nileContext,
        handlers,
      }),
  };
}

/** Include the routing fields exactly as clients send them to the shared endpoint. */
function form() {
  const body = new FormData();
  body.set("intent", "execute");
  body.set("service", "test");
  body.set("action", "main");
  return body;
}

/** Use small valid PNG declarations; existing validation checks MIME and extension allowlists. */
function file(name = "image.png", content = "data", type = "image/png") {
  return new File([content], name, { type });
}

describe("native multipart uploads", () => {
  it("preserves legacy routing-field retention and duplicate arrays", async () => {
    const body = form();
    body.append("label", "one");
    body.append("label", "two");
    body.append("file", file());
    body.append("file", file("second.png"));
    const response = await setup().send(body);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: true,
      data: {
        fields: { intent: "execute", service: "test", label: ["one", "two"] },
        files: { file: [{}, {}] },
      },
    });
  });
  it("omits action from uploaded payload fields", async () => {
    const response = await setup().send(form());
    const body = (await response.json()) as ExternalResponse;
    expect(body.data.fields).not.toHaveProperty("action");
  });
  it("retains singleton arrays for explicitly bracketed field names", async () => {
    const body = form();
    body.append("label[]", "one");
    body.append("file[]", file());
    const response = await setup().send(body);
    expect(await response.json()).toMatchObject({
      data: { fields: { "label[]": ["one"] }, files: { "file[]": [{}] } },
    });
  });
  it("rejects invalid multipart routing fields", async () => {
    const body = form();
    body.delete("service");
    const response = await setup().send(body);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      status: false,
      message:
        "Form-data must include 'intent', 'service', and 'action' fields",
    });
  });
  it("returns a graceful parsing failure for malformed multipart", async () => {
    const response = await setup().raw(
      new Request("http://localhost/api/services", {
        method: "POST",
        headers: { "content-type": "multipart/form-data; boundary=missing" },
        body: "broken",
      })
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      message: "Failed to parse multipart form data",
    });
  });
  it.each(["flat", "structured"] as const)(
    "retains existing mixed-key rejection in %s mode",
    async (uploadMode) => {
      const body = form();
      body.append("shared", "field");
      body.append("shared", file());
      const response = await setup({
        action: {
          isSpecial: { contentType: "multipart/form-data", uploadMode },
        },
      }).send(body);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        message: "mixed key types not allowed",
        data: { conflicts: ["shared"] },
      });
    }
  );
  it("enforces the action's content type and selects CORS before failure", async () => {
    let selected = "";
    const response = await setup({
      uploads: { enforceContentType: true },
      action: { isSpecial: { contentType: "application/json" } },
    }).send(form(), (_context, request) => {
      selected = `${request.service}.${request.action}`;
    });
    expect(response.status).toBe(415);
    expect(selected).toBe("test.main");
  });
  it.each([
    {
      limits: { maxFiles: 0 },
      expected: "upload limit exceeded",
      files: [file()],
    },
    {
      limits: { maxFileSize: 2 },
      expected: "upload limit exceeded",
      files: [file()],
    },
    {
      limits: { maxTotalSize: 6 },
      expected: "upload limit exceeded",
      files: [file(), file("b.png")],
    },
    {
      limits: { maxFilenameLength: 2 },
      expected: "file name too long",
      files: [file()],
    },
    { limits: { minFileSize: 5 }, expected: "file too small", files: [file()] },
    {
      limits: {},
      expected: "empty file not allowed",
      files: [file("empty.png", "")],
    },
  ])(
    "applies existing file validation: $expected $limits",
    async ({ limits, expected, files }) => {
      const body = form();
      for (const entry of files) {
        body.append("files", entry);
      }
      const response = await setup({ uploads: { limits } }).send(body);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ message: expected });
    }
  );
  it("requires both MIME and extension allowlists", async () => {
    for (const entry of [
      file("image.exe"),
      file("image.png", "data", "text/plain"),
    ]) {
      const body = form();
      body.append("file", entry);
      const response = await setup().send(body);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        message: "file type not allowed",
      });
    }
  });
  it("gates multipart discovery before dispatch", async () => {
    const body = form();
    body.set("intent", "schema");
    const response = await setup().send(body);
    expect(response.status).toBe(403);
  });
});
