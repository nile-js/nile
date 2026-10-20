import { compilePathPattern } from "./route-matcher";
import type {
  NativeHandler,
  NativeRequestContext,
  NativeRoutePattern,
} from "./types";

/** Decode optional route values only after their compiled pattern matched. */
function readParams(
  names: string[],
  matched: RegExpExecArray
): Record<string, string> {
  const params: Record<string, string> = Object.create(null);
  names.forEach((name, index) => {
    const raw = matched[index + 1];
    if (raw !== undefined) {
      params[name] = decodeURIComponent(raw);
    }
  });
  return params;
}

/** Resolve one method's compiled patterns without affecting the fixed-route lookup. */
function findPattern(
  patterns: NativeRoutePattern[],
  method: string,
  context: NativeRequestContext
): NativeHandler | undefined {
  for (const pattern of patterns) {
    if (pattern.method !== method && pattern.method !== "ALL") {
      continue;
    }
    const matched = pattern.expression.exec(context.path);
    if (!matched) {
      continue;
    }
    context.params = readParams(pattern.names, matched);
    return pattern.handler;
  }
}

/** Keep fixed routes O(1) and compile only explicitly registered parameter/wildcard paths. */
export function createNativeRouter() {
  const fixed = new Map<string, NativeHandler>();
  const patterns: NativeRoutePattern[] = [];
  return {
    route: (method: string, path: string, handler: NativeHandler) => {
      const key = method.toUpperCase();
      if (!path.startsWith("/")) {
        throw new Error("Native route paths must start with /");
      }
      if (!(path.includes(":") || path.includes("*"))) {
        fixed.set(`${key} ${path}`, handler);
        return;
      }
      patterns.push({ method: key, ...compilePathPattern(path), handler });
    },
    match: (context: NativeRequestContext): NativeHandler | undefined => {
      const method = context.request.method;
      const direct =
        fixed.get(`${method} ${context.path}`) ??
        fixed.get(`ALL ${context.path}`) ??
        (method === "HEAD" ? fixed.get(`GET ${context.path}`) : undefined);
      if (direct) {
        return direct;
      }
      const methods = method === "HEAD" ? ["HEAD", "GET"] : [method];
      for (const candidateMethod of methods) {
        const handler = findPattern(patterns, candidateMethod, context);
        if (handler) {
          return handler;
        }
      }
    },
  };
}
