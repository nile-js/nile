import { describe, expect, it, vi } from "vitest";
import { handleError } from "../../utils/handle-error";

describe("security: error handling and data leakage", () => {
  it("wraps errors in a log-id format and never returns raw internals", () => {
    const mockLogger = {
      info: vi.fn(() => "info-id"),
      warn: vi.fn(() => "warn-id"),
      error: vi.fn(() => "error-123"),
    };

    const result = handleError({
      message: "User not found",
      data: { userId: "123", password: "hunter2" },
      logger: mockLogger as any,
    });

    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error).toBe("[error-123] User not found");
      // Sensitive data must not appear in the returned error string.
      expect(result.error).not.toContain("hunter2");
    }
    expect(mockLogger.error).toHaveBeenCalledTimes(1);
  });

  it("does not leak the full data object into the error message", () => {
    const mockLogger = { error: vi.fn(() => "error-9") };
    const result = handleError({
      message: "Auth failed",
      data: { token: "secret-token-value", userId: "u1" },
      logger: mockLogger as any,
    });
    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error).not.toContain("secret-token-value");
    }
  });

  it("returns Err with a log id when a logger is provided via context fallback", () => {
    const mockLogger = { error: vi.fn(() => "error-9") };
    const result = handleError({
      message: "Something failed",
      logger: mockLogger as any,
    });
    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error).toBe("[error-9] Something failed");
    }
  });
});
