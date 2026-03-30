import { describe, expect, it } from "vitest";
import { detectMimeType } from "../detect-mime";

/** Helper: create a File from raw bytes */
function fileFromBytes(bytes: number[], name = "test"): File {
  return new File([new Uint8Array(bytes)], name);
}

describe("detectMimeType", () => {
  it("detects PNG", async () => {
    const file = fileFromBytes([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    expect(await detectMimeType(file)).toBe("image/png");
  });

  it("detects JPEG", async () => {
    const file = fileFromBytes([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(await detectMimeType(file)).toBe("image/jpeg");
  });

  it("detects GIF87a", async () => {
    const file = fileFromBytes([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]);
    expect(await detectMimeType(file)).toBe("image/gif");
  });

  it("detects GIF89a", async () => {
    const file = fileFromBytes([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    expect(await detectMimeType(file)).toBe("image/gif");
  });

  it("detects PDF", async () => {
    const file = fileFromBytes([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e]);
    expect(await detectMimeType(file)).toBe("application/pdf");
  });

  it("detects ZIP", async () => {
    const file = fileFromBytes([0x50, 0x4b, 0x03, 0x04]);
    expect(await detectMimeType(file)).toBe("application/zip");
  });

  it("detects WebP", async () => {
    // RIFF....WEBP
    const file = fileFromBytes([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    ]);
    expect(await detectMimeType(file)).toBe("image/webp");
  });

  it("returns null for RIFF without WEBP", async () => {
    // RIFF....AVI (not WebP)
    const file = fileFromBytes([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x41, 0x56, 0x49, 0x20,
    ]);
    expect(await detectMimeType(file)).toBeNull();
  });

  it("returns null for unknown bytes", async () => {
    const file = fileFromBytes([0x00, 0x01, 0x02, 0x03]);
    expect(await detectMimeType(file)).toBeNull();
  });

  it("returns null for empty file", async () => {
    const file = fileFromBytes([]);
    expect(await detectMimeType(file)).toBeNull();
  });
});
