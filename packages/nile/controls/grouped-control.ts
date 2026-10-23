import { Err, safeTry } from "slang-ts";
import type { LifecycleResource } from "../lifecycle/types";
import { assertPositive } from "./pending-call";
import type { ExecutionControl } from "./types";

/** Isolate function controls by a bounded explicit key, such as organization or document ID. */
export function createGroupedControl<Input, Output>({
  key,
  create,
  maxKeys = 1000,
  idleMs,
}: {
  key: (input: Input) => string;
  create: (key: string) => ExecutionControl<Input, Output>;
  maxKeys?: number;
  /** Dispose only after the latest call and all underlying work have drained. */
  idleMs?: number;
}): ExecutionControl<Input, Output> {
  assertPositive(maxKeys, "Grouped control maxKeys");
  if (
    idleMs !== undefined &&
    (!Number.isSafeInteger(idleMs) || idleMs < 1 || idleMs > 2_147_483_647)
  ) {
    throw new Error(
      "Grouped control idleMs must be a bounded positive integer"
    );
  }
  const groups = new Map<
    string,
    {
      control: ExecutionControl<Input, Output>;
      version: number;
      timer?: ReturnType<typeof setTimeout>;
    }
  >();
  let stopped = false;
  return {
    run(input, options) {
      if (stopped) {
        return Promise.resolve(Err("Grouped control is stopped"));
      }
      const groupKey = key(input);
      if (typeof groupKey !== "string" || !groupKey || groupKey.length > 512) {
        return Promise.resolve(
          Err("Control key must contain 1 to 512 characters")
        );
      }
      let entry = groups.get(groupKey);
      if (!entry) {
        if (groups.size >= maxKeys) {
          return Promise.resolve(Err("Grouped control key capacity reached"));
        }
        const control = create(groupKey);
        if (idleMs !== undefined && !control.whenIdle) {
          throw new Error(
            "Idle group cleanup requires a control with passive whenIdle support"
          );
        }
        entry = { control, version: 0 };
        groups.set(groupKey, entry);
      }
      const selected = entry;
      if (idleMs === undefined) {
        return selected.control.run(input, options);
      }
      clearTimeout(selected.timer);
      const generation = ++selected.version;
      const running = selected.control.run(input, options);
      return running.finally(() => {
        safeTry(() => selected.control.whenIdle?.()).then((drained) => {
          if (drained.isErr || stopped || selected.version !== generation) {
            return;
          }
          selected.timer = setTimeout(() => {
            if (
              stopped ||
              groups.get(groupKey) !== selected ||
              selected.version !== generation
            ) {
              return;
            }
            groups.delete(groupKey);
            safeTry(selected.control.close);
          }, idleMs);
        });
      });
    },
    stop() {
      stopped = true;
      for (const { control, timer } of groups.values()) {
        clearTimeout(timer);
        control.stop();
      }
    },
    close() {
      stopped = true;
      for (const { control, timer } of groups.values()) {
        clearTimeout(timer);
        control.close();
      }
    },
    async drain() {
      await Promise.all(
        [...groups.values()].map(({ control }) => control.drain())
      );
    },
  };
}

/** Register a control with lifecycle stop/drain/close ordering without hiding ownership. */
export function createControlResource<Input, Output>(
  name: string,
  control: ExecutionControl<Input, Output>
): LifecycleResource {
  return {
    name,
    stop: control.stop,
    drain: control.drain,
    close: () => control.close(),
  };
}
