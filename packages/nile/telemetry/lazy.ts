import type { NileTelemetry } from "../execution/types";
import type { TelemetryOptions } from "./types";

/** Load SDK/exporter code only when a team explicitly enables telemetry. */
export async function createNileTelemetry(
  options: TelemetryOptions
): Promise<NileTelemetry> {
  const implementation = await import("./create-telemetry");
  return implementation.createNileTelemetry(options);
}
