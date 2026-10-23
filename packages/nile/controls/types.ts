import type { Result } from "slang-ts";

/** Business functions may return ordinary values or Nile Results. */
export type ControlledTask<Input, Output> = (
  input: Input,
  signal: AbortSignal
) => Output | Result<Output, string> | Promise<Output | Result<Output, string>>;

export interface ControlCallOptions {
  signal?: AbortSignal;
}

export interface ExecutionControl<Input, Output> {
  /** Optional passive observation: unlike drain, this must never flush or change control timing. */
  whenIdle?: () => Promise<void>;
  run: (
    input: Input,
    options?: ControlCallOptions
  ) => Promise<Result<Output, string>>;
  /** Stop admission while allowing already accepted work to drain. */
  stop: () => void;
  /** Stop admission and settle pending callers. Already-running work is cooperative. */
  close: () => void;
  /** Wait for work that actually started, including work ignoring cancellation. */
  drain: () => Promise<void>;
}

export interface QueueOptions<Input, Output> {
  task: ControlledTask<Input, Output>;
  concurrency?: number;
  capacity?: number;
}

export interface TimedControlOptions<Input, Output> {
  task: ControlledTask<Input, Output>;
  waitMs: number;
}

export interface ThrottleOptions<Input, Output>
  extends TimedControlOptions<Input, Output> {
  leading?: boolean;
  trailing?: boolean;
}

export interface BatchOptions<Input, Output> {
  task: (
    items: readonly Input[],
    signal: AbortSignal
  ) =>
    | readonly Result<Output, string>[]
    | Promise<readonly Result<Output, string>[]>;
  size: number;
  waitMs: number;
  concurrency?: number;
  capacity?: number;
}
