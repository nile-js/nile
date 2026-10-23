import { safeTry } from "slang-ts";
import type {
  DescribeErrorOptions,
  ErrorCause,
  ErrorDiagnostic,
} from "./types";

const METADATA_FIELDS = ["code", "constraint", "table", "routine"] as const;
const WRAPPED_QUERY = /^Failed query:/i;

/** Read foreign errors defensively: diagnostic reporting must survive throwing getters/proxies. */
async function readField(
  value: object,
  key: string
): Promise<{ value: unknown }> {
  // Wrap the foreign field so async machinery never awaits an arbitrary thenable cause.
  const read = await safeTry(() => ({ value: Reflect.get(value, key) }));
  return read.isOk ? read.value : { value: undefined };
}

async function readCause(
  value: unknown,
  length: number,
  messages: boolean
): Promise<ErrorCause> {
  const record: ErrorCause = { name: "Error" };
  if (value !== null && typeof value === "object") {
    const { value: name } = await readField(value, "name");
    if (typeof name === "string") {
      record.name = name.slice(0, length);
    }
    for (const key of METADATA_FIELDS) {
      const { value: field } = await readField(value, key);
      if (typeof field === "string") {
        record[key] = field.slice(0, length);
      }
    }
    const { value: message } = await readField(value, "message");
    if (messages && typeof message === "string") {
      record.message = WRAPPED_QUERY.test(message)
        ? "Database query failed"
        : message.slice(0, length);
    }
    return record;
  }
  if (
    messages &&
    (typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean")
  ) {
    record.message = String(value).slice(0, length);
  }
  return record;
}

/** Preserve bounded cause/code metadata without automatically capturing SQL, parameters or raw errors. */
export async function describeError(
  error: unknown,
  options: DescribeErrorOptions = {}
): Promise<ErrorDiagnostic> {
  const depth = options.maxDepth ?? 5;
  const length = options.maxFieldLength ?? 512;
  if (!Number.isSafeInteger(depth) || depth < 1 || depth > 100) {
    throw new Error("Error maxDepth must be between 1 and 100");
  }
  if (!Number.isSafeInteger(length) || length < 1 || length > 16_384) {
    throw new Error("Error maxFieldLength must be between 1 and 16384");
  }
  const seen = new Set<object>();
  const causes: ErrorCause[] = [];
  let current = error;
  let circular = false;
  while (current !== null && current !== undefined && causes.length < depth) {
    if (typeof current === "object") {
      if (seen.has(current)) {
        circular = true;
        break;
      }
      seen.add(current);
    }
    causes.push(
      await readCause(current, length, options.includeMessages === true)
    );
    current =
      typeof current === "object"
        ? (await readField(current, "cause")).value
        : undefined;
  }
  return {
    causes: causes.reverse(),
    truncated: !circular && current !== null && current !== undefined,
    circular,
  };
}
