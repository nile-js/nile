import { count, desc, eq, lt, type SQL } from "drizzle-orm";
import { Ok, safeTry } from "slang-ts";
import { getContext } from "@/nile/server";
import { handleError } from "../handle-error";
import { createTransactionVariant } from "./create-transaction-variant";
import { getZodSchema } from "./get-zod-schema";
import type {
  CursorPage,
  ModelOperations,
  ModelOptions,
  ModelUpdateParams,
  ModelWriteParams,
  OffsetPage,
  OffsetPaginationOptions,
  PaginationOptions,
  TableSchemas,
} from "./types";

/**
 * Minimal shape of a Drizzle database instance for dynamic query building.
 * Covers the select/insert/update/delete chains used by createModel internals.
 * Avoids using the `Function` type while remaining compatible with both
 * Neon and PGLite Drizzle drivers.
 */
interface DrizzleDbLike {
  select(fields?: Record<string, unknown>): {
    from(table: unknown): DrizzleSelectQuery;
  };
  insert(table: unknown): {
    values(data: unknown): {
      returning(): Promise<unknown[]>;
    };
  };
  update(table: unknown): {
    set(data: unknown): {
      where(condition: SQL): {
        returning(): Promise<unknown[]>;
      };
    };
  };
  delete(table: unknown): {
    where(condition: SQL): {
      returning(): Promise<unknown[]>;
    };
  };
}

/** Chainable select query shape — supports where/orderBy/limit/offset in any valid order */
interface DrizzleSelectQuery extends Promise<unknown[]> {
  where(condition: SQL): DrizzleSelectQuery;
  orderBy(...cols: SQL[]): DrizzleSelectQuery;
  limit(n: number): DrizzleSelectQuery;
  offset(n: number): DrizzleSelectQuery;
}

/** Cast db to our minimal interface — safe because Drizzle drivers all expose these methods */
function asDb(db: unknown): DrizzleDbLike {
  return db as DrizzleDbLike;
}

/**
 * Resolves a database instance from the explicit option or the Nile request context.
 * Throws immediately if neither is available — this is a developer configuration error.
 */
function resolveDb<TDB>(explicitDb: TDB | undefined): TDB {
  if (explicitDb) {
    return explicitDb;
  }

  try {
    const ctx = getContext();
    if (ctx.resources?.database) {
      return ctx.resources.database as TDB;
    }
  } catch (_) {
    // context not available — fall through to throw
  }
  throw new Error(
    "createModel: No database available. Pass db in ModelOptions or set resources.database on server config."
  );
}

/**
 * Detects the timestamp column used for default ordering.
 * Checks for both snake_case (created_at) and camelCase (createdAt) conventions.
 */
function findTimestampColumn(table: Record<string, unknown>): string | null {
  if ("created_at" in table) {
    return "created_at";
  }
  if ("createdAt" in table) {
    return "createdAt";
  }
  return null;
}

/**
 * Creates a CRUD model for a Drizzle table, eliminating repetitive boilerplate.
 *
 * All methods return `Result<T, string>` — `Ok(data)` on success, `Err(message)` on failure.
 * Validation, error handling, and transaction variants are built in.
 *
 * For anything beyond basic CRUD, use the exposed `table` and `schemas` properties
 * to compose custom queries with Drizzle directly.
 *
 * @param table - Drizzle table definition (from pgTable, sqliteTable, etc.)
 * @param options - Configuration: entity name, optional db instance, cursor column
 * @returns Object with CRUD operations, plus escape hatches (table, schemas)
 *
 * @example
 * ```typescript
 * import { createModel } from "@nilejs/nile";
 * import { tasks } from "./schema";
 * import { db } from "./client";
 *
 * // Explicit db
 * export const taskModel = createModel(tasks, { db, name: "task" });
 *
 * // Context-resolved db (resolved at call time)
 * export const taskModel = createModel(tasks, { name: "task" });
 *
 * // Usage
 * const result = await taskModel.create({ data: { title: "Ship it" } });
 * const task = await taskModel.findById("uuid-123");
 * const page = await taskModel.findPaginated({ limit: 20, offset: 0 });
 * ```
 */
export function createModel<
  TTable extends Record<string, unknown>,
  TDB = unknown,
>(
  table: TTable,
  options: ModelOptions<TDB>
): ModelOperations<
  TTable extends { $inferSelect: infer S } ? S : Record<string, unknown>,
  TTable extends { $inferInsert: infer I } ? I : Record<string, unknown>,
  TDB
> {
  type TSelect = TTable extends { $inferSelect: infer S }
    ? S
    : Record<string, unknown>;
  type TInsert = TTable extends { $inferInsert: infer I }
    ? I
    : Record<string, unknown>;

  const { name, cursorColumn = "id" } = options;
  const entityName = name.charAt(0).toUpperCase() + name.slice(1);
  const schemas = getZodSchema(table) as TableSchemas<TTable>;
  const tableRef = table as Record<string, unknown>;

  /** Resolve and cast db for the current call */
  const getDb = () => asDb(resolveDb<TDB>(options.db));

  // -- Core CRUD --

  const create = async ({ data, dbx }: ModelWriteParams<TInsert, TDB>) => {
    const parsed = schemas.insert.safeParse(data);
    if (!parsed.success) {
      return handleError({
        message: `Invalid ${name} data`,
        data: { errors: parsed.error },
        atFunction: `${name}.create`,
      });
    }

    const db = dbx ? asDb(dbx) : getDb();
    const result = await safeTry(() =>
      db.insert(table).values(data).returning()
    );
    if (result.isErr) {
      return handleError({
        message: `Error creating ${name}`,
        data: { error: result.error },
        atFunction: `${name}.create`,
      });
    }

    const row = (result.value as TSelect[])?.[0] ?? null;
    if (!row) {
      return handleError({
        message: `${entityName} creation returned no data`,
        atFunction: `${name}.create`,
      });
    }
    return Ok(row);
  };

  const update = async ({ id, data, dbx }: ModelUpdateParams<TSelect, TDB>) => {
    const parsed = schemas.update.safeParse(data);
    if (!parsed.success) {
      return handleError({
        message: `Invalid ${name} data`,
        data: { errors: parsed.error },
        atFunction: `${name}.update`,
      });
    }

    const db = dbx ? asDb(dbx) : getDb();
    const idCol = tableRef.id as Parameters<typeof eq>[0];
    const result = await safeTry(() =>
      db.update(table).set(data).where(eq(idCol, id)).returning()
    );
    if (result.isErr) {
      return handleError({
        message: `Error updating ${name}`,
        data: { id, error: result.error },
        atFunction: `${name}.update`,
      });
    }

    const row = (result.value as TSelect[])?.[0] ?? null;
    if (!row) {
      return handleError({
        message: `${entityName} not found`,
        data: { id },
        atFunction: `${name}.update`,
      });
    }
    return Ok(row);
  };

  // Transaction variants via existing utility
  const createTx = createTransactionVariant(
    create as Parameters<typeof createTransactionVariant>[0]
  );
  const updateTx = createTransactionVariant(
    update as Parameters<typeof createTransactionVariant>[0]
  );

  const findById = async (id: string) => {
    const db = getDb();
    const idCol = tableRef.id as Parameters<typeof eq>[0];
    const result = await safeTry(() =>
      db.select().from(table).where(eq(idCol, id))
    );
    if (result.isErr) {
      return handleError({
        message: `Error getting ${name}`,
        data: { id, error: result.error },
        atFunction: `${name}.findById`,
      });
    }

    const row = (result.value as TSelect[])?.[0] ?? null;
    if (!row) {
      return handleError({
        message: `${entityName} not found`,
        data: { id },
        atFunction: `${name}.findById`,
      });
    }
    return Ok(row);
  };

  const deleteFn = async (id: string) => {
    const db = getDb();
    const idCol = tableRef.id as Parameters<typeof eq>[0];
    const result = await safeTry(() =>
      db.delete(table).where(eq(idCol, id)).returning()
    );
    if (result.isErr) {
      return handleError({
        message: `Error deleting ${name}`,
        data: { id, error: result.error },
        atFunction: `${name}.delete`,
      });
    }

    const row = (result.value as TSelect[])?.[0] ?? null;
    if (!row) {
      return handleError({
        message: `${entityName} not found`,
        data: { id },
        atFunction: `${name}.delete`,
      });
    }
    return Ok(row);
  };

  const findAll = async () => {
    const db = getDb();
    const tsCol = findTimestampColumn(tableRef);

    const result = await safeTry(() => {
      const query = db.select().from(table);
      if (!tsCol) {
        return query;
      }
      return query.orderBy(desc(tableRef[tsCol] as Parameters<typeof desc>[0]));
    });
    if (result.isErr) {
      return handleError({
        message: `Error getting all ${name}s`,
        data: { error: result.error },
        atFunction: `${name}.findAll`,
      });
    }

    return Ok((result.value ?? []) as TSelect[]);
  };

  /** Offset-based pagination — returns items, total count, and hasMore flag */
  const findOffsetPage = async (limit: number, offset: number) => {
    const db = getDb();
    const tsCol = findTimestampColumn(tableRef);

    const itemsResult = await safeTry(() => {
      const query = db.select().from(table);
      const ordered = tsCol
        ? query.orderBy(desc(tableRef[tsCol] as Parameters<typeof desc>[0]))
        : query;
      return ordered.limit(limit).offset(offset);
    });
    if (itemsResult.isErr) {
      return handleError({
        message: `Error getting paginated ${name}s`,
        data: { limit, offset, error: itemsResult.error },
        atFunction: `${name}.findPaginated`,
      });
    }

    const countResult = await safeTry(() =>
      db.select({ total: count() }).from(table)
    );
    if (countResult.isErr) {
      return handleError({
        message: `Error getting ${name} count`,
        data: { error: countResult.error },
        atFunction: `${name}.findPaginated`,
      });
    }

    const items = (itemsResult.value ?? []) as TSelect[];
    const total = (countResult.value as { total: number }[])?.[0]?.total ?? 0;

    return Ok({
      items,
      total,
      hasMore: offset + items.length < total,
    } satisfies OffsetPage<TSelect>);
  };

  /** Cursor-based pagination — uses lt() on the cursor column with desc ordering */
  const findCursorPage = async (
    limit: number,
    cursor: string,
    colName: string
  ) => {
    const db = getDb();
    const column = tableRef[colName];

    if (!column) {
      return handleError({
        message: `Cursor column '${colName}' does not exist on ${name} table`,
        atFunction: `${name}.findPaginated`,
      });
    }

    const typedColumn = column as Parameters<typeof lt>[0];

    // Fetch one extra row to determine hasMore without a separate count query
    const result = await safeTry(() =>
      db
        .select()
        .from(table)
        .where(lt(typedColumn, cursor))
        .orderBy(desc(typedColumn))
        .limit(limit + 1)
    );
    if (result.isErr) {
      return handleError({
        message: `Error getting paginated ${name}s`,
        data: { cursor, cursorColumn: colName, error: result.error },
        atFunction: `${name}.findPaginated`,
      });
    }

    const rows = (result.value ?? []) as TSelect[];
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const lastItem = items.at(-1) as Record<string, unknown> | undefined;
    const nextCursor = lastItem
      ? String(lastItem[colName] ?? "") || null
      : null;

    return Ok({
      items,
      nextCursor,
      hasMore,
    } satisfies CursorPage<TSelect>);
  };

  const findPaginated = (opts: PaginationOptions = {}) => {
    const limit = opts.limit ?? 50;

    // Cursor mode when cursor is provided
    if ("cursor" in opts && opts.cursor) {
      const colName = opts.cursorColumn ?? cursorColumn;
      return findCursorPage(limit, opts.cursor, colName);
    }

    // Default: offset mode
    const offset = (opts as OffsetPaginationOptions).offset ?? 0;
    return findOffsetPage(limit, offset);
  };

  return {
    create,
    createTx,
    findById,
    update,
    updateTx,
    delete: deleteFn,
    findAll,
    findPaginated,
    table,
    schemas,
  } as ModelOperations<TSelect, TInsert, TDB>;
}
