/**
 * Internal result type for safeTry
 */
export type SafeResult<T, E = unknown> =
  | { isOk: true; value: T; isErr: false; error: null }
  | { isOk: false; value: null; isErr: true; error: E };

/**
 * Gracefully handles both synchronous and asynchronous operations by returning a result object.
 * This replaces the need for external slang-ts dependency and avoids try/catch boilerplate.
 *
 * @param fn - The function to execute (sync or async)
 * @returns A result object containing either the value or the error
 *
 * @example
 * const { isOk, value, error } = await safeTry(() => fetch(url));
 */
export function safeTry<T>(
  fn: () => T | Promise<T>
): Promise<SafeResult<T>> | SafeResult<T> {
  try {
    const result = fn();

    if (result instanceof Promise) {
      return result
        .then(
          (value): SafeResult<T> => ({
            isOk: true,
            value,
            isErr: false,
            error: null,
          })
        )
        .catch(
          (error): SafeResult<T> => ({
            isOk: false,
            value: null,
            isErr: true,
            error,
          })
        );
    }

    return { isOk: true, value: result, isErr: false, error: null };
  } catch (error) {
    return { isOk: false, value: null, isErr: true, error };
  }
}
