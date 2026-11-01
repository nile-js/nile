import { Ok as slangOk, safeTry as slangSafeTry } from "slang-ts";
import { describe, expect, it } from "vitest";
import {
  createChannel,
  createSignal,
  createStepper,
  list,
  memoized,
  Ok,
  safeTry,
  sets,
  struct,
  taskGroup,
} from "./fp";

describe("Nile functional helpers", () => {
  it("re-exports current Slang helpers without another Result implementation", () => {
    expect(safeTry).toBe(slangSafeTry);
    expect(Ok).toBe(slangOk);
    const utilities = [
      list,
      struct,
      sets,
      memoized,
      taskGroup,
      createStepper,
      createSignal,
      createChannel,
    ];
    for (const utility of utilities) {
      expect(typeof utility).toBe("function");
    }
  });
});
