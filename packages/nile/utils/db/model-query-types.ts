import type { SQL } from "drizzle-orm";

/**
 * Minimal shape of a Drizzle database instance for dynamic query building.
 * Covers the select/insert/update/delete chains used by createModel internals.
 * Avoids using the `Function` type while remaining compatible with both
 * Neon and PGLite Drizzle drivers.
 */
export interface DrizzleDbLike {
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
export interface DrizzleSelectQuery extends Promise<unknown[]> {
  where(condition: SQL): DrizzleSelectQuery;
  orderBy(...cols: SQL[]): DrizzleSelectQuery;
  limit(n: number): DrizzleSelectQuery;
  offset(n: number): DrizzleSelectQuery;
}
