import { Err, Ok } from "slang-ts";
import { describe, expect, it, vi } from "vitest";
import { createTransactionVariant, getZodSchema } from "../index";

describe("DB Utilities - getZodSchema", () => {
  it("should throw for relation schemas", () => {
    const relationSchema = {
      config: {},
      table: {},
    };

    expect(() => getZodSchema(relationSchema as any)).toThrow(
      "is a relation schema, not a table schema"
    );
  });
});

describe("DB Utilities - createTransactionVariant", () => {
  it("should execute function without transaction when dbx is not provided and succeeds", async () => {
    const mockFn = vi.fn().mockResolvedValue(Ok({ id: 1 }));
    const txFn = createTransactionVariant(mockFn);

    const result = await txFn({ name: "test" } as any);

    expect(result.isOk).toBe(true);
    expect(mockFn).toHaveBeenCalledWith({ name: "test" });
  });

  it("should throw when function fails without dbx (to prevent partial writes)", async () => {
    const mockFn = vi.fn().mockResolvedValue(Err("Validation failed"));
    const txFn = createTransactionVariant(mockFn);

    await expect(txFn({ name: "test" } as any)).rejects.toThrow(
      "Validation failed"
    );
  });

  it("should execute directly when dbx is a transaction pointer", async () => {
    const mockFn = vi.fn().mockResolvedValue(Ok({ id: 1 }));
    const mockTx = {};

    const txFn = createTransactionVariant(mockFn);

    const result = await txFn({ name: "test", dbx: mockTx as any } as any);

    expect(result.isOk).toBe(true);
    expect(mockFn).toHaveBeenCalledWith({ name: "test", dbx: mockTx });
  });
});
