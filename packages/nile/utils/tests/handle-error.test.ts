import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NileLogger } from "@/nile/types";
import { handleError } from "../handle-error";

const ERROR_ID_REGEX = /^\[.+\] User account not active$/;

describe("handleError", () => {
  let mockLogger: NileLogger;
  let capturedCalls: Array<{
    atFunction: string;
    message: string;
    data?: unknown;
  }>;

  beforeEach(() => {
    capturedCalls = [];
    mockLogger = {
      info: vi.fn(() => "info-id"),
      warn: vi.fn(() => "warn-id"),
      error: vi.fn(
        (input: { atFunction: string; message: string; data?: unknown }) => {
          capturedCalls.push(input);
          return "error-123";
        }
      ),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("with explicit logger", () => {
    it("should call logger.error with correct params", () => {
      handleError({
        message: "User not found",
        data: { userId: "123" },
        logger: mockLogger,
      });

      expect(mockLogger.error).toHaveBeenCalledWith({
        atFunction: "unknown",
        message: "User not found",
        data: { userId: "123" },
      });
    });

    it("should return Err with [logId] message format", () => {
      const result = handleError({
        message: "User not found",
        logger: mockLogger,
      });

      expect(result.isErr).toBe(true);
      expect(result.error).toBe("[error-123] User not found");
    });

    it("should use atFunction override when provided", () => {
      handleError({
        message: "Something failed",
        logger: mockLogger,
        atFunction: "myHandler",
      });

      expect(capturedCalls[0]?.atFunction).toBe("myHandler");
    });

    it("should pass data to logger", () => {
      const data = { phone_number: "123", attempt: 2 };
      handleError({
        message: "Invalid credentials",
        data,
        logger: mockLogger,
      });

      expect(capturedCalls[0]?.data).toEqual(data);
    });
  });

  describe("error message format", () => {
    it("should put error ID first, then message", () => {
      const result = handleError({
        message: "User account not active",
        logger: mockLogger,
      });

      expect(result.error).toMatch(ERROR_ID_REGEX);
    });
  });
});
