import { Err } from "slang-ts";
import {
  assertPositive,
  createPendingCall,
  type PendingCall,
  runControlledTask,
} from "./pending-call";
import type { ExecutionControl, TimedControlOptions } from "./types";

/** Execute the latest input after quiet; replaced callers receive an explicit failure. */
export function createDebounce<Input, Output>({
  task,
  waitMs,
}: TimedControlOptions<Input, Output>): ExecutionControl<Input, Output> {
  assertPositive(waitMs, "Debounce waitMs");
  let pending: PendingCall<Input, Output> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  const active = new Set<Promise<void>>();
  const running = new Set<PendingCall<Input, Output>>();

  const execute = () => {
    timer = undefined;
    const call = pending;
    pending = undefined;
    if (!call || call.settled) {
      return;
    }
    running.add(call);
    const work = runControlledTask(
      task,
      call.input,
      call.controller.signal
    ).then((result) => {
      call.settle(result);
      running.delete(call);
      active.delete(work);
    });
    active.add(work);
  };
  return {
    stop() {
      closed = true;
    },
    run(input, options) {
      if (closed) {
        return Promise.resolve(Err("Debounce is closed"));
      }
      if (options?.signal?.aborted) {
        return Promise.resolve(Err("Execution cancelled"));
      }
      if (timer) {
        clearTimeout(timer);
      }
      pending?.settle(Err("Execution replaced by a newer input"));
      const call = createPendingCall<Input, Output>(input, options);
      pending = call;
      timer = setTimeout(execute, waitMs);
      return call.promise;
    },
    close() {
      closed = true;
      if (timer) {
        clearTimeout(timer);
      }
      timer = undefined;
      pending?.settle(Err("Debounce is closed"));
      pending = undefined;
      for (const call of running) {
        call.cancel();
      }
    },
    async drain() {
      // Drain means finish accepted work, including a pending trailing execution.
      if (timer) {
        clearTimeout(timer);
      }
      execute();
      await Promise.all([...active]);
    },
  };
}
