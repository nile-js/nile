import type { Action } from "./types";

/**
 * Typed identity for defining a single action with full type inference.
 * No runtime overhead — returns the config object as-is.
 */
export function createAction(config: Action): Action {
  return config;
}

/**
 * Typed identity for defining multiple actions with full type inference.
 * No runtime overhead — returns the config array as-is.
 */
export function createActions(configs: Action[]): Action[] {
  return configs;
}
