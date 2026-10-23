import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./src/index.ts"],
  format: ["esm", "cjs"],
  fixedExtension: false,
  sourcemap: true,
  clean: true,
  dts: true,
});
