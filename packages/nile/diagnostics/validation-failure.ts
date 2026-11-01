import { prettifyError, type ZodError } from "zod";
import type { ValidationIssue } from "../nile/request-scope";
import { createErrorCode } from "./error-code";

/** Preserve an explicit input-error message while generating a unique diagnostic reference. */
export function createInputFailure(
  message: string,
  issues: ValidationIssue[] = []
) {
  return {
    status: false as const,
    message,
    data: { errorCode: createErrorCode(), issues },
  };
}

/** Use Zod's readable formatter unless the caller already provided a meaningful message. */
export function createValidationFailure(error: ZodError, message?: string) {
  return createInputFailure(
    message ?? prettifyError(error),
    error.issues.map((issue) => ({
      path: issue.path.map(String).join("."),
      message: issue.message,
    }))
  );
}
