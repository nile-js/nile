import { describe, expect, it } from "vitest";
import type { UploadsConfig } from "../../rest/uploads/types";
import { validateFiles } from "../../rest/uploads/validate-files";

function file(name: string, size: number, type: string): File {
  return new File(["x".repeat(size)], name, { type });
}

const baseConfig: UploadsConfig = {
  limits: { maxFiles: 3, maxFileSize: 100, minFileSize: 1, maxTotalSize: 300 },
  allow: {
    mimeTypes: ["image/png", "image/jpeg"],
    extensions: [".png", ".jpg"],
  },
};

describe("security: multipart upload validation", () => {
  it("rejects files with a disallowed MIME type", () => {
    const result = validateFiles(
      [file("bad.exe", 10, "application/x-msdownload")],
      baseConfig
    );
    expect(result.status).toBe(false);
  });

  it("rejects files with a disallowed extension", () => {
    const result = validateFiles(
      [file("script.sh", 10, "image/png")],
      baseConfig
    );
    expect(result.status).toBe(false);
  });

  it("rejects zero-byte files", () => {
    const result = validateFiles(
      [file("empty.png", 0, "image/png")],
      baseConfig
    );
    expect(result.status).toBe(false);
  });

  it("rejects more files than maxFiles", () => {
    const result = validateFiles(
      [
        file("a.png", 10, "image/png"),
        file("b.png", 10, "image/png"),
        file("c.png", 10, "image/png"),
        file("d.png", 10, "image/png"),
      ],
      baseConfig
    );
    expect(result.status).toBe(false);
  });

  it("rejects a file larger than maxFileSize", () => {
    const result = validateFiles(
      [file("big.png", 9999, "image/png")],
      baseConfig
    );
    expect(result.status).toBe(false);
  });

  it("accepts an allowed file within all limits", () => {
    const result = validateFiles([file("ok.png", 10, "image/png")], baseConfig);
    expect(result.status).toBe(true);
  });

  it("falls back to default extensions when only a MIME allowlist is given", () => {
    const result = validateFiles([file("ok.png", 10, "image/png")], {
      ...baseConfig,
      allow: { mimeTypes: ["image/png"] },
    });
    // Only a MIME allowlist was set, so defaults still apply for extensions.
    expect(result.status).toBe(true);
  });
});
