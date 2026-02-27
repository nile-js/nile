import type { ZodTypeAny } from "zod";

/**
 * Database instance or transaction pointer type.
 * Accepts a root DB instance (with .transaction method) or a transaction pointer.
 *
 * @example
 * ```typescript
 * type DBX = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
 * ```
 */
export type DBX<TDB> = TDB extends {
  transaction: (fn: (tx: infer TX) => unknown) => unknown;
}
  ? TDB | TX
  : TDB;

/**
 * Standard params interface for functions that can optionally use a transaction.
 *
 * @example
 * ```typescript
 * const createCompany = async ({ company, dbx }: DBParams<typeof db> & { company: NewCompany }) => { ... }
 * ```
 */
export interface DBParams<TDB> {
  dbx?: DBX<TDB>;
}

/**
 * Zod schemas generated from a Drizzle table.
 */
export interface TableSchemas<_TTable> {
  insert: ZodTypeAny;
  update: ZodTypeAny;
  select: ZodTypeAny;
}
