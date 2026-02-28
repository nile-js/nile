import type { Result } from "slang-ts";
import type { DBParams } from "./types";

/**
 * Creates a transaction-aware variant of a database function.
 * Expects the wrapped function to accept a single object parameter with optional dbx field.
 *
 * When dbx is root db (has .transaction method):
 * - Creates new transaction and executes function inside it
 * - On Result.isError, throws Error to trigger automatic rollback
 * - Returns successful result or throws
 *
 * When dbx is tx pointer (no .transaction method):
 * - Executes function directly within existing transaction scope
 * - On Result.isError, throws Error to trigger parent transaction rollback
 * - Returns successful result or throws
 *
 * Both cases ensure database rollback on any error by throwing.
 *
 * @example
 * ```typescript
 * const createCompanyTx = createTransactionVariant(createCompany);
 * // Type-safe: requires all params from createCompany
 * const result = await createCompanyTx({ company: {...}, dbx: tx });
 * ```
 */
export function createTransactionVariant<
  TParams extends DBParams<TDB>,
  TData,
  TDB = unknown,
>(
  fn: (params: TParams) => Promise<Result<TData, unknown>>
): (params: TParams) => Promise<Result<TData, unknown>> {
  return async (params: TParams): Promise<Result<TData, unknown>> => {
    const { dbx, ...rest } = params;

    if (!dbx) {
      const result = await fn(params as TParams);
      if (result.isErr) {
        throw new Error(String(result.error));
      }
      return result;
    }

    const hasTransaction =
      typeof (dbx as Record<string, unknown>)?.transaction === "function";

    if (hasTransaction) {
      return await (
        dbx as unknown as {
          transaction: (
            fn: (tx: unknown) => Promise<Result<TData, unknown>>
          ) => Promise<Result<TData, unknown>>;
        }
      ).transaction(async (tx: unknown) => {
        const result = await fn({ ...rest, dbx: tx } as TParams);
        if (result.isErr) {
          throw new Error(String(result.error));
        }
        return result;
      });
    }

    const result = await fn({ ...rest, dbx } as TParams);
    if (result.isErr) {
      throw new Error(String(result.error));
    }
    return result;
  };
}
