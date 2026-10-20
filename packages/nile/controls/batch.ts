import { Err, safeTry } from "slang-ts";
import {
  assertPositive,
  createPendingCall,
  type PendingCall,
} from "./pending-call";
import type { BatchOptions, ExecutionControl } from "./types";

/** Group process-local items by size/time; each caller receives its own ordered Result. */
export function createBatch<Input, Output>({
  task,
  size,
  waitMs,
  concurrency = 1,
  capacity = 1000,
}: BatchOptions<Input, Output>): ExecutionControl<Input, Output> {
  for (const [name, value] of Object.entries({
    size,
    waitMs,
    concurrency,
    capacity,
  })) {
    assertPositive(value, `Batch ${name}`);
  }
  const pending: PendingCall<Input, Output>[] = [];
  const active = new Set<Promise<void>>();
  const controllers = new Set<AbortController>();
  const running = new Set<PendingCall<Input, Output>>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  let draining = false;
  let expired = false;
  let deadline = 0;

  const arm = () => {
    if (!pending.length || timer || closed) {
      return;
    }
    const delay = deadline ? Math.max(0, deadline - Date.now()) : waitMs;
    if (!deadline) {
      deadline = Date.now() + waitMs;
    }
    timer = setTimeout(() => {
      timer = undefined;
      expired = true;
      flush();
    }, delay);
  };
  const flush = () => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = undefined;
    while (
      active.size < concurrency &&
      pending.length &&
      (draining || expired || pending.length >= size)
    ) {
      const calls = pending.splice(0, size).filter((call) => !call.settled);
      if (!calls.length) {
        continue;
      }
      const controller = new AbortController();
      controllers.add(controller);
      for (const call of calls) {
        running.add(call);
      }
      const work = safeTry(() =>
        task(
          calls.map((call) => call.input),
          controller.signal
        )
      ).then((result) => {
        calls.map((call, index) => {
          if (result.isErr) {
            return call.settle(Err(result.error));
          }
          if (result.value.length !== calls.length) {
            return call.settle(
              Err("Batch result count does not match input count")
            );
          }
          return call.settle(
            result.value[index] ?? Err("Batch item result missing")
          );
        });
        for (const call of calls) {
          running.delete(call);
        }
        controllers.delete(controller);
        active.delete(work);
        flush();
      });
      active.add(work);
    }
    if (!pending.length) {
      deadline = 0;
      expired = false;
    }
    // An expired buffer waits for an active batch instead of spinning a zero-delay timer.
    if (pending.length && !expired) {
      arm();
    }
  };

  return {
    stop() {
      draining = true;
      flush();
    },
    run(input, options) {
      if (closed || draining) {
        return Promise.resolve(Err("Batch is closed"));
      }
      for (let index = pending.length - 1; index >= 0; index--) {
        if (pending[index]?.settled) {
          pending.splice(index, 1);
        }
      }
      if (pending.length >= capacity) {
        return Promise.resolve(Err("Batch capacity reached"));
      }
      const call = createPendingCall<Input, Output>(input, options);
      if (!call.settled) {
        pending.push(call);
      }
      flush();
      return call.promise;
    },
    close() {
      closed = true;
      if (timer) {
        clearTimeout(timer);
      }
      timer = undefined;
      for (const call of pending.splice(0)) {
        call.settle(Err("Batch is closed"));
      }
      for (const controller of controllers) {
        controller.abort();
      }
      for (const call of running) {
        call.cancel();
      }
    },
    async drain() {
      draining = true;
      flush();
      while (active.size) {
        await Promise.all([...active]);
      }
    },
  };
}
