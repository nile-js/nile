import { describe, expect, it } from "vitest";
import manifest from "../package.json";

describe("@nilejs/nile/fp", () => {
  it("re-exports every slang-ts export as the same value", async () => {
    const fp: Record<string, unknown> = await import("../fp");
    const slang: Record<string, unknown> = await import("slang-ts");
    expect(Object.keys(fp).sort()).toEqual(Object.keys(slang).sort());
    for (const name of Object.keys(slang)) {
      expect(fp[name]).toBe(slang[name]);
    }
  });

  it("is published as the ./fp subpath", () => {
    expect(manifest.exports["./fp"]).toEqual({
      types: "./dist/fp.d.ts",
      import: "./dist/fp.js",
      require: "./dist/fp.cjs",
    });
  });
});
