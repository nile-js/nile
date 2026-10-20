import pino from "pino";
import { type Result, safeTry } from "slang-ts";

interface FileLogRecord {
  log_id: string;
  appName: string;
  atFunction: string;
  message: string;
  level: "info" | "warn" | "error";
  time: string;
  data: Parameters<ReturnType<typeof pino>["info"]>[0];
  requestId?: string;
  traceId?: string;
  spanId?: string;
  runId?: string;
}

const writers = new Map<
  string,
  {
    appName: string;
    logger: ReturnType<typeof pino>;
    destination: ReturnType<typeof pino.destination>;
    ready: Promise<Result<void, string>>;
  }
>();
let writeFailures = 0;

/** Reuse asynchronous file writers instead of constructing a transport for every log entry. */
export function writeLogRecord(path: string, record: FileLogRecord): void {
  let writer = writers.get(path);
  if (!writer) {
    const destination = pino.destination({
      dest: path,
      mkdir: true,
      sync: false,
    });
    destination.on("error", () => {
      writeFailures++;
    });
    const ready = safeTry(
      () =>
        new Promise<void>((resolve, reject) => {
          const onReady = () => {
            destination.off("error", onError);
            resolve();
          };
          const onError = (error: Error) => {
            destination.off("ready", onReady);
            reject(error);
          };
          destination.once("ready", onReady);
          destination.once("error", onError);
        })
    );
    writer = {
      appName: record.appName,
      destination,
      ready,
      logger: pino(
        {
          base: null,
          timestamp: false,
          formatters: { level: (label) => ({ level: label }) },
        },
        destination
      ),
    };
    writers.set(path, writer);
  }
  writer.logger[record.level](record);
}

/** Inspect destination errors without recursively logging through a broken destination. */
export function getLogWriteFailures(): number {
  return writeFailures;
}

/** Flush only the selected application's file writers, preserving other Nile instances. */
export async function flushLoggers(appName: string): Promise<void> {
  await Promise.all(
    [...writers.values()]
      .filter((writer) => writer.appName === appName)
      .map(async (writer) => {
        const opened = await writer.ready;
        if (opened.isErr) {
          throw new Error("Log destination could not open");
        }
        await new Promise<void>((resolve, reject) =>
          writer.destination.flush((error?: Error) =>
            error ? reject(error) : resolve()
          )
        );
      })
  );
}

/** Release selected writers after draining; a later log can create a fresh writer. */
export async function closeLoggers(appName: string): Promise<void> {
  const flushed = await safeTry(() => flushLoggers(appName));
  for (const [path, writer] of writers) {
    if (writer.appName !== appName) {
      continue;
    }
    writers.delete(path);
    const closed = await safeTry(() => {
      if (flushed.isErr) {
        writer.destination.destroy();
      } else {
        writer.destination.end();
      }
    });
    if (closed.isErr) {
      writeFailures++;
    }
  }
  if (flushed.isErr) {
    throw new Error("Log flush failed during cleanup");
  }
}
