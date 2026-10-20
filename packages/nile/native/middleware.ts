import type { NativeMiddleware, NativeRequestContext } from "./types";

/** Preserve late middleware registration and onion ordering on native routes, including short circuits. */
export function createNativeMiddleware() {
  const registry: { path: string; fn: NativeMiddleware }[] = [];
  const addMiddleware = (path: string, fn: NativeMiddleware) => {
    if (registry.length >= 50) {
      throw new Error(
        "Maximum middleware limit (50) reached. Cannot register more middleware."
      );
    }
    registry.push({ path, fn });
  };
  const run = (
    context: NativeRequestContext,
    handler: () => Response | Promise<Response>
  ) => {
    if (registry.length === 0) {
      return handler();
    }
    const matching = registry.filter((entry) =>
      context.path.startsWith(entry.path)
    );
    if (matching.length === 0) {
      return handler();
    }
    let lastIndex = -1;
    const dispatch = async (index: number): Promise<void> => {
      if (index <= lastIndex) {
        throw new Error("next() called multiple times");
      }
      lastIndex = index;
      const entry = matching[index];
      if (!entry) {
        context.respond(await handler());
        return;
      }
      const result = await entry.fn(context, () => dispatch(index + 1));
      if (result instanceof Response) {
        context.respond(result);
      }
    };
    return dispatch(0).then(() => {
      if (!context.response) {
        throw new Error(
          "Native middleware completed without a response or next()"
        );
      }
      return context.response;
    });
  };
  return { addMiddleware, run };
}
