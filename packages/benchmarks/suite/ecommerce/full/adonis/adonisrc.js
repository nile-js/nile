import { defineConfig } from "@adonisjs/core/app";

export default defineConfig({
  providers: [() => import("@adonisjs/core/providers/app_provider")],
});
