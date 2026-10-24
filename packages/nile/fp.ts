/**
 * Functional programming helpers from slang-ts, re-exported so applications import
 * Results, Options and the rest from Nile without a separate dependency. These are the
 * same functions Nile's pipeline uses, so `Ok`, `Err` and `safeTry` match exactly.
 *
 * @example
 * import { Err, Ok, safeTry } from "@nilejs/nile/fp";
 */
export * from "slang-ts";
