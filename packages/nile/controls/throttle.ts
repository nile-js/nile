import { Err } from "slang-ts";
import {
  assertPositive,
  createPendingCall,
  type PendingCall,
  runControlledTask,
} from "./pending-call";
import type { ExecutionControl, ThrottleOptions } from "./types";

/** Bound start frequency; optional trailing execution keeps only the latest input. */
export function createThrottle<Input, Output>({
  task,
  waitMs,
  leading = true,
  trailing = false,
}: ThrottleOptions<Input, Output>): ExecutionControl<Input, Output> {
  assertPositive(waitMs, "Throttle waitMs");
  if (!(leading || trailing)) {
    throw new Error("Throttle needs leading or trailing execution");
  }
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: PendingCall<Input, Output> | undefined;
  const active = new Set<Promise<void>>();
  const running = new Set<PendingCall<Input, Output>>();

  const execute = (call: PendingCall<Input, Output>) => {
    if (call.settled) {
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
  const openWindow = () => {
    timer = setTimeout(() => {
      timer = undefined;
      const call = pending;
      pending = undefined;
      if (!call || call.settled) {
        return;
      }
      execute(call);
      openWindow();
    }, waitMs);
  };
  return {
    stop() {
      closed = true;
    },
    run(input, options) {
      if (closed) {
        return Promise.resolve(Err("Throttle is closed"));
      }
      if (options?.signal?.aborted) {
        return Promise.resolve(Err("Execution cancelled"));
      }
      if (timer && !trailing) {
        return Promise.resolve(Err("Execution throttled"));
      }
      const call = createPendingCall<Input, Output>(input, options);
      if (timer) {
        pending?.settle(Err("Execution replaced by a newer input"));
        pending = call;
      } else {
        openWindow();
        if (leading) {
          execute(call);
        } else {
          pending = call;
        }
      }
      return call.promise;
    },
    close() {
      closed = true;
      if (timer) {
        clearTimeout(timer);
      }
      timer = undefined;
      pending?.settle(Err("Throttle is closed"));
      pending = undefined;
      for (const call of running) {
        call.cancel();
      }
    },
    async drain() {
      if (timer) {
        clearTimeout(timer);
      }
      timer = undefined;
      const call = pending;
      pending = undefined;
      if (call) {
        execute(call);
      }
      await Promise.all([...active]);
    },
  };
}
