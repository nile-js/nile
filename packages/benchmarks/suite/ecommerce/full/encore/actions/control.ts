import { api } from "encore.dev/api";
import { controlHandler } from "./workload";

/** Coordinator-only state controls; excluded from the 300 business routes and timings. */
export const benchmarkControl = api.raw(
  { expose: true, method: "POST", path: "/benchmark/control" },
  controlHandler
);
