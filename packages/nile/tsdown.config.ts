import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["index.ts", "fp.ts"],
  format: ["esm", "cjs"],
  fixedExtension: false,
  sourcemap: true,
  clean: true,
  dts: {
    sourcemap: true,
  },
});
