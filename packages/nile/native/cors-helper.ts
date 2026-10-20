import type { CorsHelper } from "@/cors/types";
import type { NativeCorsOptions } from "./cors-types";

/** Isolate mutable resolver options so one request cannot change another's defaults. */
export function createNativeCorsHelper(
  defaults: NativeCorsOptions
): CorsHelper & { toOptions: () => NativeCorsOptions } {
  const state = { ...defaults };
  state.allowHeaders = defaults.allowHeaders?.slice();
  state.allowMethods = Array.isArray(defaults.allowMethods)
    ? defaults.allowMethods.slice()
    : defaults.allowMethods;
  state.exposeHeaders = defaults.exposeHeaders?.slice();
  return {
    allowOrigin: (origin) => {
      state.origin = origin;
    },
    deny: () => {
      state.origin = "";
    },
    addHeaders: (headers) => {
      state.allowHeaders = [...(state.allowHeaders ?? []), ...headers];
    },
    setHeaders: (headers) => {
      state.allowHeaders = headers.slice();
    },
    setMethods: (methods) => {
      state.allowMethods = methods.slice();
    },
    setCredentials: (value) => {
      state.credentials = value;
    },
    setMaxAge: (seconds) => {
      state.maxAge = seconds;
    },
    setExposeHeaders: (headers) => {
      state.exposeHeaders = headers.slice();
    },
    toOptions: () => state,
  };
}
