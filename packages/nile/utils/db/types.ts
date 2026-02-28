import type { Result } from "slang-ts";
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

// -- createModel types --

/**
 * Configuration for the createModel factory.
 *
 * @property db - Explicit database instance. When omitted, resolved from Nile context at call time.
 * @property name - Human-readable entity name for error messages (e.g. "task", "user").
 * @property cursorColumn - Default column name for cursor-based pagination. Defaults to "id".
 */
export interface ModelOptions<TDB = unknown> {
  db?: TDB;
  name: string;
  cursorColumn?: string;
}

/** Params for model methods that support transactions */
export interface ModelWriteParams<TInsert, TDB> {
  data: TInsert;
  dbx?: DBX<TDB>;
}

/** Params for model update methods */
export interface ModelUpdateParams<TSelect, TDB> {
  id: string;
  data: Partial<TSelect>;
  dbx?: DBX<TDB>;
}

/** Offset-based pagination result */
export interface OffsetPage<T> {
  items: T[];
  total: number;
  hasMore: boolean;
}

/** Cursor-based pagination result */
export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/** Offset pagination options */
export interface OffsetPaginationOptions {
  limit?: number;
  offset?: number;
  cursor?: never;
  cursorColumn?: never;
}

/** Cursor pagination options — value is the cursor, column overrides model default */
export interface CursorPaginationOptions {
  limit?: number;
  cursor: string;
  cursorColumn?: string;
  offset?: never;
}

export type PaginationOptions =
  | OffsetPaginationOptions
  | CursorPaginationOptions;

/** All CRUD operations returned by createModel */
export interface ModelOperations<TSelect, TInsert, TDB> {
  /** Insert a new record with auto-validation */
  create(
    params: ModelWriteParams<TInsert, TDB>
  ): Promise<Result<TSelect, string>>;
  /** Insert a new record wrapped in a transaction */
  createTx(
    params: ModelWriteParams<TInsert, TDB>
  ): Promise<Result<TSelect, string>>;
  /** Find a single record by UUID */
  findById(id: string): Promise<Result<TSelect, string>>;
  /** Update a record by UUID with auto-validation */
  update(
    params: ModelUpdateParams<TSelect, TDB>
  ): Promise<Result<TSelect, string>>;
  /** Update a record wrapped in a transaction */
  updateTx(
    params: ModelUpdateParams<TSelect, TDB>
  ): Promise<Result<TSelect, string>>;
  /** Delete a record by UUID, returns the deleted row */
  delete(id: string): Promise<Result<TSelect, string>>;
  /** Get all records ordered by newest first (when created_at/createdAt exists) */
  findAll(): Promise<Result<TSelect[], string>>;
  /** Paginated query — offset-based when offset is set, cursor-based when cursor is set */
  findPaginated(
    options?: OffsetPaginationOptions
  ): Promise<Result<OffsetPage<TSelect>, string>>;
  findPaginated(
    options: CursorPaginationOptions
  ): Promise<Result<CursorPage<TSelect>, string>>;
  findPaginated(
    options?: PaginationOptions
  ): Promise<Result<OffsetPage<TSelect> | CursorPage<TSelect>, string>>;
  /** The underlying Drizzle table — escape hatch for custom queries */
  table: unknown;
  /** Auto-generated Zod schemas for insert/update/select validation */
  schemas: TableSchemas<unknown>;
}
