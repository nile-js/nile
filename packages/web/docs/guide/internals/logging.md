---
title: "Logging"
description: "Follow related executions through structured logs and correlation IDs"
---

Supply a logger through `resources.logger`. Actions, hooks and error helpers can then write structured logs with the current execution’s identifier.

## Configure a logger

```ts
import { createLogger, createNileServer } from "@nilejs/nile";
import { services } from "./services";

const logger = createLogger("back-office", {
  mode: "prod",
  chunking: "daily",
});

const server = await createNileServer({
  serverName: "Back Office",
  services,
  resources: { logger },
});

logger.info({
  atFunction: "startup",
  message: "Application registered",
  data: { actions: server.stats().totalActions },
});
```

`createLogger` binds an application name and exposes `info`, `warn` and `error`. Each entry includes the application, function, message, optional data, level, time and a log ID.

## Choose output deliberately

| Mode | Behavior |
| --- | --- |
| `dev` | Prints readable records to the console and writes no file. |
| `prod` | Writes structured records through Pino to local log files; returns the log ID. |
| `agentic` | Writes nothing and returns the record as a JSON string, for the caller to use. |

Files are written under `logs/` relative to the working directory. With no chunking, the path is `logs/{appName}.log`. Daily, weekly and monthly chunking split files under an application subdirectory.

Chunking only splits files by time. Storing, collecting and deleting old logs is part of your deployment. Leave credentials, sensitive payloads and personal data out of log entries.

## Return a failure with log context

For an expected refusal, `Err("Project is archived")` is often enough. For a failure that needs investigation, `handleError` logs through an explicit logger or the current Nile resource and returns an Err:

```ts
import { utils } from "@nilejs/nile";

const failure = utils.handleError({
  logger,
  atFunction: "projects.create",
  message: "Could not save the project",
  data: { operation: "insert-project" },
});
```

`handleError` generates a unique code, stores it as the log record’s `log_id`, and returns `Error Code: <generated-code> - <your message>`. The code is independent of a custom logger’s return value. Use it to locate the corresponding record. `handleError` throws if no logger is available: missing logging configuration should be fixed rather than silently ignored.

Inside an HTTP request, direct action call or scheduled execution, Nile’s logger automatically includes the active `requestId` and any `traceId`, `spanId` or `runId`. Startup logs have no execution to attach. Plain `console.log` calls and arbitrary third-party loggers do not receive this metadata.

Use `requestId`, `runId` and `traceId` in `getLogs` filters to follow related records. Failures and slow executions receive diagnostic summaries when a logger is configured; successful summaries are opt-in. For a hosted destination, configure [telemetry](/guide/reference/operations#read-logs-then-add-a-destination-when-useful). Nile exports traces and metrics through OTLP while file logs remain available.

## Read local records

```ts
import { getLogs } from "@nilejs/nile";

const errors = getLogs(
  { appName: "back-office", level: "error" },
  { chunking: "daily" },
);
```

Use the same chunking strategy as the writer. Filters include application name, log ID, level and date range. Reading local files suits inspection on one machine; use [telemetry](/guide/features/telemetry) to see every instance.

Continue with [errors and Results](/guide/basics/errors-and-results) and [hooks](/guide/basics/hooks-and-pipelines).
