import { Err } from "slang-ts";
import {
  assertPositive,
  createPendingCall,
  type PendingCall,
  runControlledTask,
} from "./pending-call";
import type { ExecutionControl, QueueOptions } from "./types";

/** Bound process-local FIFO work; a cancelled running task retains its concurrency slot until it ends. */
export function createQueue<Input, Output>({
  task,
  concurrency = 1,
  capacity = 1000,
}: QueueOptions<Input, Output>): ExecutionControl<Input, Output> {
  assertPositive(concurrency, "Queue concurrency");
  assertPositive(capacity, "Queue capacity");
  const pending: PendingCall<Input, Output>[] = [];
  const active = new Set<PendingCall<Input, Output>>();
  const waiters = new Set<() => void>();
  let closed = false;

  const notify = () => {
    if (active.size || pending.length) {
      return;
    }
    const waiting = [...waiters];
    waiters.clear();
    for (const resolve of waiting) {
      resolve();
    }
  };
  const pump = () => {
    while (active.size < concurrency && pending.length) {
      const call = pending.shift();
      if (!call || call.settled) {
        continue;
      }
      active.add(call);
      runControlledTask(task, call.input, call.controller.signal).then(
        (result) => {
          call.settle(result);
          active.delete(call);
          pump();
          notify();
        }
      );
    }
    notify();
  };

  return {
    stop() {
      closed = true;
    },
    run(input, options) {
      if (closed) {
        return Promise.resolve(Err("Queue is closed"));
      }
      // Remove cancelled waiting calls before applying the admission bound.
      for (let index = pending.length - 1; index >= 0; index--) {
        if (pending[index]?.settled) {
          pending.splice(index, 1);
        }
      }
      if (active.size >= concurrency && pending.length >= capacity) {
        return Promise.resolve(Err("Queue capacity reached"));
      }
      const call = createPendingCall<Input, Output>(input, options);
      if (!call.settled) {
        pending.push(call);
      }
      pump();
      return call.promise;
    },
    close() {
      closed = true;
      for (const call of pending.splice(0)) {
        call.settle(Err("Queue is closed"));
      }
      for (const call of active) {
        call.cancel();
      }
      notify();
    },
    drain() {
      if (!(active.size || pending.length)) {
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => waiters.add(resolve));
    },
  };
}
