import { Err } from "slang-ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createModel } from "../create-model";

// Mock getZodSchema — real drizzle-zod needs Drizzle table metadata (internal Symbols)
// that mock tables don't have. Return zod-like schemas with safeParse support.
vi.mock("../get-zod-schema", () => ({
  getZodSchema: vi.fn(() => ({
    insert: { safeParse: (data: unknown) => ({ success: true, data }) },
    update: { safeParse: (data: unknown) => ({ success: true, data }) },
    select: { safeParse: (data: unknown) => ({ success: true, data }) },
  })),
}));

// Mock handleError — returns proper slang-ts Err without needing a logger
vi.mock("@/utils/handle-error", () => ({
  handleError: vi.fn(({ message }: { message: string }) =>
    Err(`[test-id] ${message}`)
  ),
}));

// Mock getContext — tests that pass db explicitly won't need it
vi.mock("@/nile/server", () => ({
  getContext: vi.fn(() => ({ resources: {} })),
}));

// -- Test helpers --

/** Creates a mock Drizzle table with id + created_at columns (mimics pgTable output) */
function createMockTable() {
  return {
    id: { name: "id" },
    title: { name: "title" },
    created_at: { name: "created_at" },
    [Symbol.for("drizzle:Name")]: "mock_table",
  };
}

/**
 * Creates a mock Drizzle DB that records calls and returns controlled results.
 * Uses promise-returning methods to satisfy lint rules (no thenable objects).
 */
function createMockDb(
  overrides: {
    selectResult?: unknown[];
    insertResult?: unknown[];
    updateResult?: unknown[];
    deleteResult?: unknown[];
    countResult?: { total: number }[];
    shouldThrow?: boolean;
  } = {}
) {
  const {
    selectResult = [],
    insertResult = [{ id: "new-1", title: "Test" }],
    updateResult = [{ id: "upd-1", title: "Updated" }],
    deleteResult = [{ id: "del-1", title: "Deleted" }],
    countResult = [{ total: 10 }],
    shouldThrow = false,
  } = overrides;

  const resolve = <T>(val: T) => {
    if (shouldThrow) {
      return Promise.reject(new Error("DB error"));
    }
    return Promise.resolve(val);
  };

  // Each method in the chain returns an object with further chainable methods.
  // The chain is a real Promise subclass so `await` works without a plain `then` property.
  const makeSelectChain = (result: unknown[]) => {
    const base = resolve(result);
    // Attach chainable methods directly onto the promise
    const chain = Object.assign(base, {
      where: () => makeSelectChain(result),
      orderBy: () => makeSelectChain(result),
      limit: () => makeSelectChain(result),
      offset: () => resolve(result),
    });
    return chain;
  };

  return {
    select: vi.fn((fields?: Record<string, unknown>) => {
      const isCount = fields && "total" in fields;
      return {
        from: vi.fn(() =>
          makeSelectChain(isCount ? countResult : selectResult)
        ),
      };
    }),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => resolve(insertResult)),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => resolve(updateResult)),
        })),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn(() => resolve(deleteResult)),
      })),
    })),
  };
}

describe("createModel", () => {
  const mockTable = createMockTable();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("factory setup", () => {
    it("should return an object with all CRUD methods", () => {
      const db = createMockDb();
      const model = createModel(mockTable as never, { db, name: "task" });

      expect(model).toHaveProperty("create");
      expect(model).toHaveProperty("createTx");
      expect(model).toHaveProperty("findById");
      expect(model).toHaveProperty("update");
      expect(model).toHaveProperty("updateTx");
      expect(model).toHaveProperty("delete");
      expect(model).toHaveProperty("findAll");
      expect(model).toHaveProperty("findPaginated");
      expect(model).toHaveProperty("table");
      expect(model).toHaveProperty("schemas");
    });

    it("should expose the original table as escape hatch", () => {
      const db = createMockDb();
      const model = createModel(mockTable as never, { db, name: "task" });

      expect(model.table).toBe(mockTable);
    });

    it("should expose generated zod schemas", () => {
      const db = createMockDb();
      const model = createModel(mockTable as never, { db, name: "task" });

      expect(model.schemas).toHaveProperty("insert");
      expect(model.schemas).toHaveProperty("update");
      expect(model.schemas).toHaveProperty("select");
    });
  });

  describe("create", () => {
    it("should return Ok with created row on success", async () => {
      const row = { id: "abc-123", title: "New task" };
      const db = createMockDb({ insertResult: [row] });
      const model = createModel(mockTable as never, { db, name: "task" });

      const result = await model.create({
        data: { title: "New task" } as never,
      });

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value).toEqual(row);
      }
    });

    it("should return Err when insert returns empty array", async () => {
      const db = createMockDb({ insertResult: [] });
      const model = createModel(mockTable as never, { db, name: "task" });

      const result = await model.create({ data: { title: "Test" } as never });

      expect(result.isErr).toBe(true);
    });

    it("should return Err when db throws", async () => {
      const db = createMockDb({ shouldThrow: true });
      const model = createModel(mockTable as never, { db, name: "task" });

      const result = await model.create({ data: { title: "Test" } as never });

      expect(result.isErr).toBe(true);
    });
  });

  describe("findById", () => {
    it("should return Ok with found row", async () => {
      const row = { id: "abc-123", title: "Found task" };
      const db = createMockDb({ selectResult: [row] });
      const model = createModel(mockTable as never, { db, name: "task" });

      const result = await model.findById("abc-123");

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value).toEqual(row);
      }
    });

    it("should return Err when row not found", async () => {
      const db = createMockDb({ selectResult: [] });
      const model = createModel(mockTable as never, { db, name: "task" });

      const result = await model.findById("nonexistent");

      expect(result.isErr).toBe(true);
    });
  });

  describe("update", () => {
    it("should return Ok with updated row on success", async () => {
      const row = { id: "abc-123", title: "Updated" };
      const db = createMockDb({ updateResult: [row] });
      const model = createModel(mockTable as never, { db, name: "task" });

      const result = await model.update({
        id: "abc-123",
        data: { title: "Updated" } as never,
      });

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value).toEqual(row);
      }
    });

    it("should return Err when row not found for update", async () => {
      const db = createMockDb({ updateResult: [] });
      const model = createModel(mockTable as never, { db, name: "task" });

      const result = await model.update({
        id: "nonexistent",
        data: { title: "Nope" } as never,
      });

      expect(result.isErr).toBe(true);
    });
  });

  describe("delete", () => {
    it("should return Ok with deleted row", async () => {
      const row = { id: "abc-123", title: "Deleted" };
      const db = createMockDb({ deleteResult: [row] });
      const model = createModel(mockTable as never, { db, name: "task" });

      const result = await model.delete("abc-123");

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value).toEqual(row);
      }
    });

    it("should return Err when row not found for delete", async () => {
      const db = createMockDb({ deleteResult: [] });
      const model = createModel(mockTable as never, { db, name: "task" });

      const result = await model.delete("nonexistent");

      expect(result.isErr).toBe(true);
    });
  });

  describe("findAll", () => {
    it("should return Ok with all rows", async () => {
      const rows = [
        { id: "1", title: "First" },
        { id: "2", title: "Second" },
      ];
      const db = createMockDb({ selectResult: rows });
      const model = createModel(mockTable as never, { db, name: "task" });

      const result = await model.findAll();

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value).toEqual(rows);
      }
    });

    it("should return Ok with empty array when no rows", async () => {
      const db = createMockDb({ selectResult: [] });
      const model = createModel(mockTable as never, { db, name: "task" });

      const result = await model.findAll();

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value).toEqual([]);
      }
    });
  });

  describe("findPaginated - offset mode", () => {
    it("should return offset page with items, total, and hasMore", async () => {
      const rows = [{ id: "1", title: "Task 1" }];
      const db = createMockDb({
        selectResult: rows,
        countResult: [{ total: 5 }],
      });
      const model = createModel(mockTable as never, { db, name: "task" });

      const result = await model.findPaginated({ limit: 2, offset: 0 });

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value).toHaveProperty("items");
        expect(result.value).toHaveProperty("total", 5);
        expect(result.value).toHaveProperty("hasMore", true);
      }
    });

    it("should default to offset mode when no cursor provided", async () => {
      const db = createMockDb({
        selectResult: [],
        countResult: [{ total: 0 }],
      });
      const model = createModel(mockTable as never, { db, name: "task" });

      const result = await model.findPaginated();

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value).toHaveProperty("total", 0);
        expect(result.value).toHaveProperty("hasMore", false);
      }
    });
  });

  describe("findPaginated - cursor mode", () => {
    it("should return cursor page with items, nextCursor, and hasMore", async () => {
      // Return limit+1 rows to indicate hasMore
      const rows = [
        { id: "3", title: "Task 3", created_at: "2024-03-01" },
        { id: "2", title: "Task 2", created_at: "2024-02-01" },
        { id: "1", title: "Task 1", created_at: "2024-01-01" },
      ];
      const db = createMockDb({ selectResult: rows });
      const model = createModel(mockTable as never, { db, name: "task" });

      const result = await model.findPaginated({
        limit: 2,
        cursor: "4",
        cursorColumn: "id",
      });

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value).toHaveProperty("hasMore", true);
        expect(result.value).toHaveProperty("nextCursor");
        expect((result.value as { items: unknown[] }).items).toHaveLength(2);
      }
    });

    it("should return hasMore false when fewer rows than limit", async () => {
      const rows = [{ id: "1", title: "Only one" }];
      const db = createMockDb({ selectResult: rows });
      const model = createModel(mockTable as never, { db, name: "task" });

      const result = await model.findPaginated({
        limit: 10,
        cursor: "5",
      });

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value).toHaveProperty("hasMore", false);
      }
    });
  });

  describe("db resolution", () => {
    it("should throw when no db and no context available", async () => {
      const model = createModel(mockTable as never, { name: "task" });

      await expect(model.findAll()).rejects.toThrow("No database available");
    });
  });

  describe("entity naming", () => {
    it("should capitalize entity name in error messages", async () => {
      const db = createMockDb({ selectResult: [] });
      const model = createModel(mockTable as never, { db, name: "task" });

      const result = await model.findById("nonexistent");

      expect(result.isErr).toBe(true);
      if (result.isErr) {
        expect(result.error).toContain("Task not found");
      }
    });
  });
});
