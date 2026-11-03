import { describe, expect, it } from "vitest";
import { createNileSocketClient } from "../index.js";

const callStub = () => {
  createNileSocketClient({ baseUrl: "http://localhost:8000" });
};

describe("createNileSocketClient", () => {
  it("is still exported and throws migration guidance", () => {
    expect(callStub).toThrow(/createNileClient/);
  });

  it("names the replacement socket methods and the guide", () => {
    expect(callStub).toThrow(/nile\.socket\.send/);
    expect(callStub).toThrow(
      /nile-js\.github\.io\/nile\/guide\/features\/websockets/
    );
  });
});
