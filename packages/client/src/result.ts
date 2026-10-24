import type { ClientErr, ClientOk } from "./types.js";

/**
 * A successful client result. `data` mirrors `value` so code written for
 * earlier clients keeps working. `message` is present only when the server sent one.
 */
export function clientOk<T>(value: T, message?: string): ClientOk<T> {
  return {
    isOk: true,
    isErr: false,
    value: value,
    error: null,
    ...(message === undefined ? {} : { message: message }),
    data: value,
  };
}

/**
 * A failed client result with a readable message and any data the server
 * attached to the failure. `data` stays null, as it was for earlier clients.
 */
export function clientErr(error: string, details: unknown = null): ClientErr {
  return {
    isOk: false,
    isErr: true,
    value: null,
    error: error,
    details: details,
    data: null,
  };
}
