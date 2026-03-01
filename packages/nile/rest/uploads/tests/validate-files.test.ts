import { describe, expect, it } from "vitest";
import type { UploadsConfig } from "../types";
import {
  validateAllowlist,
  validateFileCount,
  validateFilenameLength,
  validateFileSize,
  validateFiles,
  validateMinFileSize,
  validateTotalSize,
  validateZeroByteFiles,
} from "../validate-files";

// --- Helper ---

function createTestFile(name: string, size: number, type: string): File {
  const content = new Uint8Array(size);
  return new File([content], name, { type });
}

// --- validateFilenameLength ---

describe("validateFilenameLength", () => {
  it("passes when all file names are within the limit", () => {
    const files = [createTestFile("short.txt", 100, "text/plain")];
    const result = validateFilenameLength(files, 20);
    expect(result).toEqual({ status: true });
  });

  it("fails when a file name exceeds the limit", () => {
    const longName = `${"a".repeat(21)}.txt`;
    const files = [createTestFile(longName, 100, "text/plain")];
    const result = validateFilenameLength(files, 20);
    expect(result.status).toBe(false);
    expect(result.message).toBe("file name too long");
    expect(result.data).toEqual({
      error_category: "validation",
      files: [longName],
      maxLength: 20,
    });
  });

  it("passes when file name length is exactly at the limit", () => {
    const exactName = `${"a".repeat(16)}.txt`; // 20 chars
    const files = [createTestFile(exactName, 100, "text/plain")];
    const result = validateFilenameLength(files, 20);
    expect(result).toEqual({ status: true });
  });

  it("fails when file name is one char over the limit", () => {
    const overName = `${"a".repeat(17)}.txt`; // 21 chars
    const files = [createTestFile(overName, 100, "text/plain")];
    const result = validateFilenameLength(files, 20);
    expect(result.status).toBe(false);
  });

  it("reports all offending files when multiple exceed the limit", () => {
    const long1 = `${"a".repeat(30)}.txt`;
    const long2 = `${"b".repeat(25)}.png`;
    const ok = "short.txt";
    const files = [
      createTestFile(long1, 100, "text/plain"),
      createTestFile(ok, 100, "text/plain"),
      createTestFile(long2, 100, "image/png"),
    ];
    const result = validateFilenameLength(files, 20);
    expect(result.status).toBe(false);
    expect(result.data?.files).toEqual([long1, long2]);
  });
});

// --- validateZeroByteFiles ---

describe("validateZeroByteFiles", () => {
  it("passes when all files have size > 0", () => {
    const files = [createTestFile("file.txt", 10, "text/plain")];
    const result = validateZeroByteFiles(files);
    expect(result).toEqual({ status: true });
  });

  it("fails when a file is zero bytes", () => {
    const files = [createTestFile("empty.txt", 0, "text/plain")];
    const result = validateZeroByteFiles(files);
    expect(result.status).toBe(false);
    expect(result.message).toBe("empty file not allowed");
    expect(result.data).toEqual({
      error_category: "validation",
      files: ["empty.txt"],
    });
  });

  it("reports only empty files in a mixed set", () => {
    const files = [
      createTestFile("ok.txt", 100, "text/plain"),
      createTestFile("empty1.txt", 0, "text/plain"),
      createTestFile("good.pdf", 500, "application/pdf"),
      createTestFile("empty2.txt", 0, "text/plain"),
    ];
    const result = validateZeroByteFiles(files);
    expect(result.status).toBe(false);
    expect(result.data?.files).toEqual(["empty1.txt", "empty2.txt"]);
  });
});

// --- validateMinFileSize ---

describe("validateMinFileSize", () => {
  it("passes when all files are above the minimum size", () => {
    const files = [createTestFile("big.txt", 1024, "text/plain")];
    const result = validateMinFileSize(files, 100);
    expect(result).toEqual({ status: true });
  });

  it("fails when a file is below the minimum size", () => {
    const files = [createTestFile("tiny.txt", 5, "text/plain")];
    const result = validateMinFileSize(files, 100);
    expect(result.status).toBe(false);
    expect(result.message).toBe("file too small");
    expect(result.data).toEqual({
      error_category: "validation",
      limit: "minFileSize",
      min: 100,
      files: [{ name: "tiny.txt", size: 5 }],
    });
  });

  it("passes when file size is exactly at the minimum", () => {
    const files = [createTestFile("exact.txt", 100, "text/plain")];
    const result = validateMinFileSize(files, 100);
    expect(result).toEqual({ status: true });
  });

  it("fails when file is one byte below the minimum", () => {
    const files = [createTestFile("under.txt", 99, "text/plain")];
    const result = validateMinFileSize(files, 100);
    expect(result.status).toBe(false);
    expect(result.data?.files).toEqual([{ name: "under.txt", size: 99 }]);
  });
});

// --- validateFileCount ---

describe("validateFileCount", () => {
  it("passes when file count is within the limit", () => {
    const files = [createTestFile("a.txt", 10, "text/plain")];
    const result = validateFileCount(files, 5);
    expect(result).toEqual({ status: true });
  });

  it("fails when file count exceeds the limit", () => {
    const files = Array.from({ length: 6 }, (_, i) =>
      createTestFile(`file${i}.txt`, 10, "text/plain")
    );
    const result = validateFileCount(files, 5);
    expect(result.status).toBe(false);
    expect(result.message).toBe("upload limit exceeded");
    expect(result.data).toEqual({
      error_category: "validation",
      limit: "maxFiles",
      max: 5,
      received: 6,
    });
  });

  it("passes when file count is exactly at the limit", () => {
    const files = Array.from({ length: 5 }, (_, i) =>
      createTestFile(`file${i}.txt`, 10, "text/plain")
    );
    const result = validateFileCount(files, 5);
    expect(result).toEqual({ status: true });
  });
});

// --- validateFileSize ---

describe("validateFileSize", () => {
  it("passes when all files are under the size limit", () => {
    const files = [createTestFile("ok.txt", 500, "text/plain")];
    const result = validateFileSize(files, 1024);
    expect(result).toEqual({ status: true });
  });

  it("fails when a file exceeds the size limit", () => {
    const files = [createTestFile("huge.txt", 2000, "text/plain")];
    const result = validateFileSize(files, 1024);
    expect(result.status).toBe(false);
    expect(result.message).toBe("upload limit exceeded");
    expect(result.data).toEqual({
      error_category: "validation",
      limit: "maxFileSize",
      max: 1024,
      files: [{ name: "huge.txt", size: 2000 }],
    });
  });

  it("passes when file size is exactly at the limit", () => {
    const files = [createTestFile("exact.txt", 1024, "text/plain")];
    const result = validateFileSize(files, 1024);
    expect(result).toEqual({ status: true });
  });

  it("reports all oversized files", () => {
    const files = [
      createTestFile("big1.txt", 2000, "text/plain"),
      createTestFile("ok.txt", 500, "text/plain"),
      createTestFile("big2.txt", 3000, "text/plain"),
    ];
    const result = validateFileSize(files, 1024);
    expect(result.status).toBe(false);
    expect(result.data?.files).toEqual([
      { name: "big1.txt", size: 2000 },
      { name: "big2.txt", size: 3000 },
    ]);
  });
});

// --- validateTotalSize ---

describe("validateTotalSize", () => {
  it("passes when combined size is within the limit", () => {
    const files = [
      createTestFile("a.txt", 300, "text/plain"),
      createTestFile("b.txt", 200, "text/plain"),
    ];
    const result = validateTotalSize(files, 1000);
    expect(result).toEqual({ status: true });
  });

  it("fails when combined size exceeds the limit", () => {
    const files = [
      createTestFile("a.txt", 600, "text/plain"),
      createTestFile("b.txt", 500, "text/plain"),
    ];
    const result = validateTotalSize(files, 1000);
    expect(result.status).toBe(false);
    expect(result.message).toBe("upload limit exceeded");
    expect(result.data).toEqual({
      error_category: "validation",
      limit: "maxTotalSize",
      max: 1000,
      total: 1100,
    });
  });

  it("passes when combined size is exactly at the limit", () => {
    const files = [
      createTestFile("a.txt", 500, "text/plain"),
      createTestFile("b.txt", 500, "text/plain"),
    ];
    const result = validateTotalSize(files, 1000);
    expect(result).toEqual({ status: true });
  });
});

// --- validateAllowlist ---

describe("validateAllowlist", () => {
  const mimes = ["image/png", "application/pdf"];
  const exts = [".png", ".pdf"];

  it("passes when file matches both MIME type and extension", () => {
    const files = [createTestFile("photo.png", 100, "image/png")];
    const result = validateAllowlist(files, mimes, exts);
    expect(result).toEqual({ status: true });
  });

  it("fails when MIME type does not match", () => {
    const files = [createTestFile("file.png", 100, "text/plain")];
    const result = validateAllowlist(files, mimes, exts);
    expect(result.status).toBe(false);
    expect(result.message).toBe("file type not allowed");
    expect(result.data?.rejected).toEqual([
      { name: "file.png", type: "text/plain" },
    ]);
    expect(result.data?.allowed).toEqual({
      mimeTypes: mimes,
      extensions: exts,
    });
  });

  it("fails when extension does not match", () => {
    const files = [createTestFile("file.bmp", 100, "image/png")];
    const result = validateAllowlist(files, mimes, exts);
    expect(result.status).toBe(false);
    expect(result.data?.rejected).toEqual([
      { name: "file.bmp", type: "image/png" },
    ]);
  });

  it("fails when MIME matches but extension does not (both must match)", () => {
    const files = [createTestFile("doc.exe", 100, "application/pdf")];
    const result = validateAllowlist(files, mimes, exts);
    expect(result.status).toBe(false);
  });

  it("handles case-insensitive extension matching", () => {
    const files = [createTestFile("PHOTO.PNG", 100, "image/png")];
    const result = validateAllowlist(files, mimes, exts);
    expect(result).toEqual({ status: true });
  });
});

// --- validateFiles (composite) ---

describe("validateFiles", () => {
  const validConfig: UploadsConfig = {
    limits: {
      maxFiles: 5,
      maxFileSize: 1024,
      minFileSize: 1,
      maxTotalSize: 4096,
      maxFilenameLength: 50,
    },
    allow: {
      mimeTypes: ["image/png", "application/pdf"],
      extensions: [".png", ".pdf"],
    },
  };

  it("passes with valid files and valid config", () => {
    const files = [createTestFile("photo.png", 500, "image/png")];
    const result = validateFiles(files, validConfig);
    expect(result).toEqual({ status: true });
  });

  it("returns status true for an empty files array", () => {
    const result = validateFiles([], validConfig);
    expect(result).toEqual({ status: true });
  });

  it("uses defaults when config has no overrides", () => {
    // Defaults: maxFiles=10, maxFileSize=10MB, minFileSize=1, maxTotalSize=20MB,
    // maxFilenameLength=128, mimes=[png,jpeg,pdf], exts=[.png,.jpg,.jpeg,.pdf]
    const files = [createTestFile("photo.png", 500, "image/png")];
    const result = validateFiles(files, {});
    expect(result).toEqual({ status: true });
  });

  it("fails on filename length before other validators", () => {
    const longName = `${"a".repeat(51)}.png`;
    const files = [createTestFile(longName, 500, "image/png")];
    const result = validateFiles(files, validConfig);
    expect(result.status).toBe(false);
    expect(result.message).toBe("file name too long");
  });

  it("fails on zero-byte check before min-size check", () => {
    const files = [createTestFile("e.png", 0, "image/png")];
    const config: UploadsConfig = {
      ...validConfig,
      limits: { ...validConfig.limits, minFileSize: 100 },
    };
    const result = validateFiles(files, config);
    // Zero-byte check runs before min-size check
    expect(result.message).toBe("empty file not allowed");
  });

  it("fails on file count before file size check", () => {
    const files = Array.from({ length: 6 }, (_, i) =>
      createTestFile(`f${i}.png`, 2000, "image/png")
    );
    const result = validateFiles(files, validConfig);
    // File count (max 5) should fail before individual file size (max 1024)
    expect(result.message).toBe("upload limit exceeded");
    expect(result.data?.limit).toBe("maxFiles");
  });

  it("custom config overrides defaults", () => {
    const config: UploadsConfig = {
      limits: { maxFileSize: 50 },
      allow: {
        mimeTypes: ["text/plain"],
        extensions: [".txt"],
      },
    };
    const files = [createTestFile("doc.txt", 100, "text/plain")];
    const result = validateFiles(files, config);
    // Should fail because 100 > 50 (custom maxFileSize)
    expect(result.status).toBe(false);
    expect(result.data?.limit).toBe("maxFileSize");
  });

  it("fails on allowlist when MIME/extension mismatch", () => {
    const files = [createTestFile("file.exe", 100, "application/x-msdownload")];
    const result = validateFiles(files, validConfig);
    expect(result.status).toBe(false);
    expect(result.message).toBe("file type not allowed");
  });
});
