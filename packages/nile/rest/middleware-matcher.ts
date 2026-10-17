import type { MiddlewareEntry } from "./types";

/** Reuse the fixed RPC path match without retaining arbitrary request paths. */
export function createMiddlewareMatcher({
  servicesPath,
  readRegistry,
}: {
  servicesPath: string;
  readRegistry: () => readonly MiddlewareEntry[];
}): {
  match: (requestPath: string) => readonly MiddlewareEntry[];
  invalidate: () => void;
} {
  let servicesMatch: readonly MiddlewareEntry[] | undefined;

  return {
    match: (requestPath) => {
      if (requestPath === servicesPath && servicesMatch) {
        return servicesMatch;
      }
      const matching = readRegistry().filter((entry) =>
        requestPath.startsWith(entry.path)
      );
      if (requestPath === servicesPath) {
        servicesMatch = matching;
      }
      return matching;
    },
    invalidate: () => {
      servicesMatch = undefined;
    },
  };
}
