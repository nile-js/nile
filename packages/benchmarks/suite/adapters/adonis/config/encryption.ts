import { defineConfig, drivers } from "@adonisjs/core/encryption";

// Public benchmark fixture configuration, no secret material or encrypted data.
export default defineConfig({
  default: "app",
  list: {
    app: drivers.aes256gcm({
      id: "app",
      keys: ["benchmark-only-public-key-00000001"],
    }),
  },
});
