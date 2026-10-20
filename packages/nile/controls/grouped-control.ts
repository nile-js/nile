import { Err } from "slang-ts";
import type { LifecycleResource } from "../lifecycle/types";
import { assertPositive } from "./pending-call";
import type { ExecutionControl } from "./types";

/** Isolate function controls by a bounded explicit key, such as organization or document ID. */
export function createGroupedControl<Input, Output>({
  key,
  create,
  maxKeys = 1000,
}: {
  key: (input: Input) => string;
  create: (key: string) => ExecutionControl<Input, Output>;
  maxKeys?: number;
}): ExecutionControl<Input, Output> {
  assertPositive(maxKeys, "Grouped control maxKeys");
  const groups = new Map<string, ExecutionControl<Input, Output>>();
  let stopped = false;
  return {
    run(input, options) {
      if (stopped) {
        return Promise.resolve(Err("Grouped control is stopped"));
      }
      const groupKey = key(input);
      if (!groupKey || groupKey.length > 512) {
        return Promise.resolve(
          Err("Control key must contain 1 to 512 characters")
        );
      }
      let control = groups.get(groupKey);
      if (!control) {
        if (groups.size >= maxKeys) {
          return Promise.resolve(Err("Grouped control key capacity reached"));
        }
        control = create(groupKey);
        groups.set(groupKey, control);
      }
      return control.run(input, options);
    },
    stop() {
      stopped = true;
      for (const control of groups.values()) {
        control.stop();
      }
    },
    close() {
      stopped = true;
      for (const control of groups.values()) {
        control.close();
      }
    },
    async drain() {
      await Promise.all([...groups.values()].map((control) => control.drain()));
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
