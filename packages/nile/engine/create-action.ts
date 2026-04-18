import type { Action } from "./types";

/**
 * Typed identity for defining a single action with full type inference.
 * No runtime overhead — returns the config object as-is.
 *
 * @example
 * const handler: ActionHandler<{ title: string }> = async (data) => {
 *   return Ok({ id: "1", title: data.title });
 * };
 *
 * export const createTask = createAction({
 *   name: "create-task",
 *   description: "Create a new task",
 *   handler,
 *   validation: createTaskSchema,
 * });
 */
export function createAction<T = unknown, E = string>(
  config: Action<T, E>
): Action<T, E> {
  return config;
}

/**
 * Typed identity for defining multiple actions with full type inference.
 * No runtime overhead — returns the config array as-is.
 */
export function createActions<T = unknown, E = string>(
  configs: Action<T, E>[]
): Action<T, E>[] {
  return configs;
}
