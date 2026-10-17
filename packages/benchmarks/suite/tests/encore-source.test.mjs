import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import test from "node:test";
import { createRawHandler as createPlainHandler } from "../encore/plain/actions/workload.ts";
import { createRawHandler as createValidatedHandler } from "../encore/validated/actions/workload.ts";

/** Test the raw helper in isolation; this does not replace Encore native runtime verification. */
const invokeRawHandler = async ({ handler, payload }) => {
  const response = {
    status: 0,
    text: "",
    writeHead(status) {
      this.status = status;
    },
    end(text) {
      this.text = text;
    },
  };
  await handler(Readable.from([payload]), response);
  return response;
};

for (const mode of ["plain", "validated", "native"]) {
  test(`Encore ${mode}: 300 distinct compiler-visible literal route declarations`, async () => {
    const folder = new URL(`../encore/${mode}/actions/`, import.meta.url);
    const files = (await readdir(folder)).filter((name) =>
      /^actions-\d+\.ts$/.test(name)
    );
    const sources = await Promise.all(
      files.map((name) => readFile(new URL(name, folder), "utf8"))
    );
    const paths = sources.flatMap((source) =>
      [...source.matchAll(/path: "(\/actions\/action-\d+)"/g)].map(
        (match) => match[1]
      )
    );
    assert.equal(paths.length, 300);
    assert.deepEqual(
      new Set(paths),
      new Set(
        Array.from({ length: 300 }, (_, action) => `/actions/action-${action}`)
      )
    );
    for (const source of sources) assert.ok(source.split("\n").length <= 400);
  });
}

test("Encore raw helpers: actual JSON handling and action-specific output", async () => {
  for (const createHandler of [createPlainHandler, createValidatedHandler]) {
    const handler = createHandler({
      action: 299,
      isValidated: createHandler === createValidatedHandler,
    });
    const response = await invokeRawHandler({
      handler,
      payload: '{"id":23,"value":999}',
    });
    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(response.text), {
      id: 23,
      value: 1000,
      action: 299,
    });
    assert.equal(
      (await invokeRawHandler({ handler, payload: "{" })).status,
      400
    );
  }
});

test("Encore common-Zod helper: invalid numeric and missing fields rejected", async () => {
  const handler = createValidatedHandler({ action: 0, isValidated: true });
  for (const body of [
    {},
    null,
    { id: -1, value: 0 },
    { id: 0.5, value: 0 },
    { id: Number.MAX_SAFE_INTEGER + 1, value: 0 },
    { id: 0, value: -1 },
    { id: 0, value: 1000 },
    { id: 0, value: 0.5 },
  ]) {
    const response = await invokeRawHandler({
      handler,
      payload: JSON.stringify(body),
    });
    assert.equal(response.status, 400);
  }
});
