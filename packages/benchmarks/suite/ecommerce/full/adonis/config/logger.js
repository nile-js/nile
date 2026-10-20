import { defineConfig } from "@adonisjs/core/logger";

export default defineConfig({
  default: "app",
  loggers: {
    app: { enabled: false, name: "benchmark", level: "silent" },
  },
});
