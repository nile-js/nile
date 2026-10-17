import type { HookContext } from "@/engine/types";

/** Keep each action's mutable hook state and logs independent of other executions. */
export function createHookContext({
  actionName,
  input,
}: Pick<HookContext, "actionName" | "input">): HookContext {
  return {
    actionName,
    input,
    state: {},
    log: { before: [], after: [] },
  };
}
