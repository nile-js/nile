import type { Result } from "slang-ts";

export type LifecycleState = "initializing" | "ready" | "draining" | "stopped";
export interface LifecycleResource {
  name: string;
  /** Stop accepting work synchronously before any drain begins. */
  stop?: () => void | Promise<void>;
  drain?: () => void | Promise<void>;
  close?: (signal: AbortSignal) => void | Promise<void>;
}
export interface ShutdownReport {
  timedOut: boolean;
  errors: string[];
  remainingExecutions: number;
}
export interface NileLifecycle {
  state: () => LifecycleState;
  isReady: () => boolean;
  active: () => number;
  ready: () => void;
  register: (resource: LifecycleResource) => () => void;
  enter: (
    signal?: AbortSignal,
    parentSignal?: AbortSignal
  ) => Result<{ signal: AbortSignal; finish: () => void }, string>;
  shutdown: (options?: { timeoutMs?: number }) => Promise<ShutdownReport>;
}
