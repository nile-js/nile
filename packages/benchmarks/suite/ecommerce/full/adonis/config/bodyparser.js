import { defineConfig } from "@adonisjs/core/bodyparser";

export default defineConfig({
  allowedMethods: ["POST"],
  json: {
    limit: "1mb",
    strict: true,
    convertEmptyStringsToNull: false,
    types: ["application/json"],
  },
});
