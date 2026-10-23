import { Err, safeTry } from "slang-ts";
import { describeError } from "../../diagnostics/describe-error";
import { getContext } from "../../nile/server";
import type { DbTryOptions } from "./types";

const LOG_REFERENCE = /^[A-Za-z0-9._:-]{1,128}$/;

/** Keep driver diagnostics at the logger boundary while preserving Slang's recursive Result resolution. */
export function dbTry<T>(
  fn: () => T | Promise<T>,
  options: DbTryOptions = {}
): ReturnType<typeof safeTry<T>> {
  let logReference: string | undefined;
  const message = options.message ?? "Database operation failed";
  const guarded = () =>
    Promise.resolve()
      .then(fn)
      .catch(async (error: unknown) => {
        const scoped = options.logger
          ? undefined
          : await safeTry(() => getContext());
        const logger =
          options.logger ??
          (scoped?.isOk ? scoped.value.resources?.logger : undefined);
        if (logger) {
          const diagnostic = await describeError(error, {
            includeMessages: options.includeMessages,
          });
          const reported = await safeTry(() =>
            logger.error({
              atFunction: options.atFunction ?? "dbTry",
              message,
              data: { diagnostic },
            })
          );
          if (reported.isOk && LOG_REFERENCE.test(reported.value)) {
            logReference = reported.value;
          }
        }
        // safeTry captures this replacement; the original SQL/parameters stay out of caller errors.
        throw new Error(message);
      });
  return safeTry<T>(guarded).then((result) =>
    result.isErr
      ? Err(logReference ? `[${logReference}] ${message}` : message)
      : result
  );
}
