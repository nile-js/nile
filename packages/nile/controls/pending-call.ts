import { Err, type Result, safeTry } from "slang-ts";
import type { ControlCallOptions, ControlledTask } from "./types";

/** Guard task failures at one boundary; Output denotes the final business value, not a Result wrapper. */
export async function runControlledTask<Input, Output>(
  task: ControlledTask<Input, Output>,
  input: Input,
  signal: AbortSignal
): Promise<Result<Output, string>> {
  // Slang recursively unwraps Results. Its conditional type cannot reduce an unconstrained
  // generic, so preserve this factory's declared final-value contract at the boundary.
  return (await safeTry(() => task(input, signal))) as Result<Output, string>;
}

/** A caller settles exactly once; cancellation never loses the underlying work reference. */
export function createPendingCall<Input, Output>(
  input: Input,
  options: ControlCallOptions = {}
) {
  let finish!: (result: Result<Output, string>) => void;
  let settled = false;
  const controller = new AbortController();
  const promise = new Promise<Result<Output, string>>((resolve) => {
    finish = resolve;
  });
  const settle = (result: Result<Output, string>) => {
    if (settled) {
      return;
    }
    settled = true;
    options.signal?.removeEventListener("abort", cancel);
    finish(result);
  };
  const cancel = () => {
    controller.abort();
    settle(Err("Execution cancelled"));
  };
  if (options.signal?.aborted) {
    cancel();
  } else {
    options.signal?.addEventListener("abort", cancel, { once: true });
  }
  return {
    input,
    promise,
    controller,
    settle,
    cancel,
    get settled() {
      return settled;
    },
  };
}

export type PendingCall<Input, Output> = ReturnType<
  typeof createPendingCall<Input, Output>
>;

/** Reject invalid scheduling bounds before any work or timers are created. */
export function assertPositive(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive safe integer`);
  }
}
