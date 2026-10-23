---
title: "Logging"
description: "Follow related executions through structured logs and correlation IDs"
---

A consistent log format helps a small team follow a failure back to the operation that produced it. Nile includes a structured logger; supply it through resources so actions, hooks and error helpers can use the same convention.

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
| `dev` | Writes readable records to the console; returns a console-oriented marker. |
| `prod` | Writes structured records through Pino to local log files; returns the log ID. |
| `agentic` | Returns a JSON record string for the caller to consume; it is not an agent integration or persistent log sink. |

Files are written under `logs/` relative to the working directory. With no chunking, the path is `logs/{appName}.log`. Daily, weekly and monthly chunking split files under an application subdirectory.

Time-based chunking does not delete old logs, ship them to another system or provide a retention policy. Configure storage, collection and retention for your deployment. Avoid recording credentials, sensitive payloads or personal data unnecessarily.

## Return a failure with log context

For an expected business refusal, `Err("Project is archived")` may be enough. For a failure that needs investigation, `handleError` logs through an explicit logger or the current Nile resource and returns an Err:

```ts
import { utils } from "@nilejs/nile";

const failure = utils.handleError({
  logger,
  atFunction: "projects.create",
  message: "Could not save the project",
  data: { operation: "insert-project" },
});
```

The returned message includes the logger’s returned identifier. In production mode this can be used to locate the corresponding record. `handleError` throws if no logger is available: missing logging configuration should be fixed rather than silently ignored.

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

Use the same chunking strategy as the writer. Filters include application name, log ID, level and date range. Reading local files is useful for inspection; it is not a substitute for deployment-wide observability.

Continue with [errors and Results](/guide/basics/errors-and-results) and [hooks](/guide/basics/hooks-and-pipelines).
