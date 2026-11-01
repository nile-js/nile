const LOGGED_ERROR_PATTERN_1 =
  /^Error Code: [A-Za-z0-9_-]{12} - Could not save order$/;

import { Err, Ok, safeTry } from "slang-ts";
import { describe, expect, it, vi } from "vitest";
import { handleError } from "../utils/handle-error";
import { describeError } from "./describe-error";

const PRIVATE_DATA = /SELECT|private|duplicate/;

const driver = () =>
  Object.assign(new Error("duplicate private value"), {
    code: "23505",
    constraint: "orders_reference_key",
    detail: "private account details",
  });

describe("database error diagnostics", () => {
  it("preserves deepest cause metadata without copying query strings or private details", async () => {
    const error = new Error("Failed query: SELECT secret; params: private", {
      cause: driver(),
    });
    const diagnostic = await describeError(error);
    expect(diagnostic.causes[0]).toMatchObject({
      code: "23505",
      constraint: "orders_reference_key",
    });
    expect(JSON.stringify(diagnostic)).not.toMatch(PRIVATE_DATA);
    const explicit = await describeError(error, { includeMessages: true });
    expect(explicit.causes[0]?.message).toBe("duplicate private value");
    expect(explicit.causes[1]?.message).toBe("Database query failed");
  });
  it("bounds circular causes and survives hostile properties", async () => {
    const error = new Error("cyclic");
    error.cause = error;
    expect((await describeError(error)).circular).toBe(true);
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error("getter failed");
        },
      }
    );
    expect((await describeError(hostile)).causes).toEqual([{ name: "Error" }]);
    const asynchronousCause = new Error("outer", {
      cause: new Promise(() => undefined),
    });
    expect((await describeError(asynchronousCause)).causes).toHaveLength(2);
    const deep = new Error("outer", { cause: new Error("inner") });
    expect((await describeError(deep, { maxDepth: 1 })).truncated).toBe(true);
  });
  it("reads Slang raw causes and keeps safe model errors separate from diagnostics", async () => {
    const logged = vi.fn(() => "log-id");
    const logger = { error: logged, info: logged, warn: logged };
    const original = new Error("Failed query: SELECT secret", {
      cause: driver(),
    });
    const captured = await safeTry(() => Promise.reject(original));
    expect(captured.raw).toBe(original);
    expect(Object.keys(captured)).not.toContain("raw");
    expect(JSON.stringify(captured)).not.toContain("23505");
    const failed = handleError({
      logger,
      message: "Could not save order",
      atFunction: "orders.create",
      data: { diagnostic: await describeError(captured.raw) },
    });
    expect(failed.isErr && failed.error).toMatch(LOGGED_ERROR_PATTERN_1);
    expect(JSON.stringify(logged.mock.calls)).toContain("23505");
    expect(JSON.stringify(logged.mock.calls)).not.toMatch(PRIVATE_DATA);
    const success = await safeTry(() => Ok(5));
    expect(success.isOk && success.value).toBe(5);
    const returnedFailure = await safeTry(() => Err("business refusal"));
    expect(returnedFailure.isErr && returnedFailure.error).toBe(
      "business refusal"
    );
  });
});
