import { APIError } from "encore.dev/api";
import type { Min, Max } from "encore.dev/validate";

export interface NativeInput {
  id: number & Min<0> & Max<9007199254740991>;
  value: number & Min<0> & Max<999>;
}

export interface BenchmarkOutput {
  id: number;
  value: number;
  action: number;
}

/** Rust validates field types/bounds; JS adds integer checks absent from Encore's numeric tags. */
export const buildNativeOutput = (
  body: NativeInput,
  action: number
): BenchmarkOutput => {
  if (!(Number.isSafeInteger(body.id) && Number.isInteger(body.value))) {
    throw APIError.invalidArgument("Input fields must be integers");
  }
  return { id: body.id, value: body.value + 1, action };
};
