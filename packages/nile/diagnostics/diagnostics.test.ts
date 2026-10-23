import { Err, Ok } from "slang-ts";
import { describe, expect, it, vi } from "vitest";
import { dbTry } from "../utils/db/db-try";
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
  it("returns safe caller errors, reports metadata and retains recursive Slang result behavior", async () => {
    const logged = vi.fn(() => "log-id");
    const logger = { error: logged, info: logged, warn: logged };
    const failed = await dbTry(
      () =>
        Promise.reject(
          new Error("Failed query: SELECT secret", { cause: driver() })
        ),
      { logger, message: "Could not save order", atFunction: "orders.create" }
    );
    expect(failed.isErr && failed.error).toBe("[log-id] Could not save order");
    expect(JSON.stringify(logged.mock.calls)).toContain("23505");
    expect(JSON.stringify(logged.mock.calls)).not.toContain("SELECT");
    const nested = await dbTry(() => Ok(Ok(5)));
    expect(nested.isOk && nested.value).toBe(5);
    const returnedFailure = await dbTry(() => Err("internal query details"));
    expect(returnedFailure.isErr && returnedFailure.error).toBe(
      "Database operation failed"
    );
    const throwing = {
      ...logger,
      error: () => {
        throw new Error("logging failed");
      },
    };
    expect(
      (await dbTry(() => Promise.reject(driver()), { logger: throwing })).isErr
    ).toBe(true);
  });
});
