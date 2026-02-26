# Logging

**Type:** Reference / Specification
**Path:** `src/logging/`

## 1. Purpose

The logging module provides structured, append-only log persistence for Nile applications. It writes NDJSON log entries to disk via pino, supports optional time-based file chunking, and exposes a query API for reading logs back with filters.

### 1.1 Responsibilities

- **Log creation** — Write structured NDJSON records to disk (production/test) or stdout (dev/agentic mode)
- **File chunking** — Optionally split log files into time-based chunks (monthly, daily, weekly) organized in per-app directories
- **Log retrieval** — Query logs with filters (appName, log_id, level, date range) with smart chunk selection to avoid scanning irrelevant files
- **Factory API** — `createLogger(appName, config?)` returns a bound logger with `.info()`, `.warn()`, `.error()` methods

### 1.2 Non-Goals

- **Size-based rotation** — The module does not implement log rotation by file size. Only time-based chunking is supported.
- **Log shipping** — No built-in support for sending logs to external services (e.g., Datadog, Elasticsearch). Consumers can build this on top of the query API.
- **Diagnostics logging** — Internal nile diagnostics (engine, REST, server boot messages) use `createDiagnosticsLog` from `src/utils.ts`, not this module. See section 7.

## 2. Architecture

| File | Responsibility |
|------|----------------|
| `logger.ts` | Core logic: `createLog`, `getLogs`, `resolveLogPath`, `formatChunkName`, chunk helpers, types |
| `create-log.ts` | `createLogger` factory — returns a bound logger with level methods |
| `index.ts` | Barrel exports for the public API |

## 3. Public API

### 3.1 `createLogger(appName, config?)`

**Path:** `src/logging/create-log.ts`

Factory that returns a logger bound to a specific app name. Optionally accepts chunking config.

```typescript
import { createLogger } from "@/logging";

// Flat mode (backwards compatible) — writes to logs/my-app.log
const logger = createLogger("my-app");

// With monthly chunking — writes to logs/my-app/2026-02.log
const logger = createLogger("my-app", { chunking: "monthly" });

logger.info({ atFunction: "handleRequest", message: "Request received", data: { path: "/api" } });
logger.warn({ atFunction: "validateInput", message: "Missing field" });
logger.error({ atFunction: "processOrder", message: "Payment failed", data: { orderId: "123" } });
```

**Returns:** `{ info, warn, error }` — each method takes a `LogInput` (same as `Log` minus `appName`).

### 3.2 `createLog(log, config?)`

**Path:** `src/logging/logger.ts`

Lower-level function that writes a single log entry. Used internally by `createLogger`.

```typescript
import { createLog } from "@/logging";

const logId = createLog({
  appName: "my-app",
  atFunction: "startup",
  message: "Server started",
  level: "info",
  data: { port: 3000 },
}, { chunking: "daily" });
```

**Behavior by MODE:**
- `prod` / `NODE_ENV=test` — Writes NDJSON to the resolved log file path. Test mode uses `appendFileSync` for deterministic reads; prod uses pino async transport.
- `agentic` — Returns the log record as a JSON string (no file I/O).
- Any other value — Prints to `console.log` and returns `"dev-mode, see your dev console!"`.

**Returns:** The generated `log_id` (nanoid, 6 chars), or JSON string in agentic mode.

**Throws:** If `log.appName` is missing.

### 3.3 `getLogs(filters?, config?)`

**Path:** `src/logging/logger.ts`

Reads and filters log entries from disk. Supports both flat files and chunked directories.

```typescript
import { getLogs } from "@/logging";

// All logs for an app (flat mode)
const logs = getLogs({ appName: "my-app" });

// Filtered by level and date range (chunked mode)
const errors = getLogs(
  { appName: "my-app", level: "error", from: new Date("2026-01-01"), to: new Date("2026-01-31") },
  { chunking: "monthly" }
);
```

**Filters (`LogFilter`):**
- `appName` — Filter by app name (required for chunked mode to locate the directory)
- `log_id` — Filter by specific log ID
- `level` — Filter by `"info"`, `"warn"`, or `"error"`
- `from` / `to` — Date range filter (inclusive)

**Smart chunk selection:** When chunking is enabled and date filters are provided, `getLogs` computes the date range of each chunk file and skips files that fall entirely outside the requested range. This avoids reading and parsing irrelevant files.

**Returns:** `Log[]` — array of matching log entries.

### 3.4 `resolveLogPath(appName, config?)`

Computes the file path for a given app and chunking config. Exported for testing and advanced use.

```typescript
import { resolveLogPath } from "@/logging";

resolveLogPath("my-app");                              // logs/my-app.log
resolveLogPath("my-app", { chunking: "monthly" });     // logs/my-app/2026-02.log
resolveLogPath("my-app", { chunking: "daily" });       // logs/my-app/2026-02-27.log
resolveLogPath("my-app", { chunking: "weekly" });      // logs/my-app/2026-W09.log
```

Creates the app subdirectory if it doesn't exist.

### 3.5 `formatChunkName(date, chunking)`

Formats a date into the chunk filename (without extension). Exported for testing and reuse.

```typescript
import { formatChunkName } from "@/logging";

formatChunkName(new Date("2026-02-15"), "monthly");  // "2026-02"
formatChunkName(new Date("2026-02-15"), "daily");    // "2026-02-15"
formatChunkName(new Date("2026-02-15"), "weekly");   // "2026-W07"
```

## 4. Key Types

### 4.1 `Log`

```typescript
{
  atFunction: string;
  appName: string;
  message: string;
  data?: unknown;
  level?: "info" | "warn" | "error";
  log_id?: string;
}
```

The `level` field is used both in the TypeScript interface and in the serialized NDJSON records. Previously this was `type` in the interface and `level` in the JSON — this mismatch has been normalized.

### 4.2 `LoggerConfig`

```typescript
{
  chunking?: "monthly" | "daily" | "weekly" | "none";
}
```

- `"none"` (default) — Single flat file per app: `logs/{appName}.log`
- `"monthly"` — `logs/{appName}/YYYY-MM.log`
- `"daily"` — `logs/{appName}/YYYY-MM-DD.log`
- `"weekly"` — `logs/{appName}/YYYY-WNN.log` (ISO 8601 week number)

### 4.3 `LogFilter`

```typescript
{
  appName?: string;
  log_id?: string;
  level?: "info" | "warn" | "error";
  from?: Date;
  to?: Date;
}
```

## 5. File Layout

### 5.1 Flat Mode (default)

```
logs/
  my-app.log          # NDJSON, one record per line
  another-app.log
```

### 5.2 Chunked Mode

```
logs/
  my-app/
    2026-01.log       # monthly
    2026-02.log
  daily-app/
    2026-02-25.log    # daily
    2026-02-26.log
    2026-02-27.log
  weekly-app/
    2026-W08.log      # weekly (ISO week)
    2026-W09.log
```

Each file contains NDJSON records identical in format to flat mode. The only difference is where they are written.

## 6. Internal Helpers

These functions are not exported but are critical to `getLogs` performance:

- `resolveLogFiles(filters, chunking)` — Determines which files to read. For flat mode, returns the single file. For chunked mode, scans the app directory and filters by date relevance.
- `isChunkRelevant(filename, chunking, filters)` — Checks if a chunk file's date range overlaps with the filter's `from`/`to` range.
- `getChunkDateRange(chunkName, chunking)` — Parses a chunk filename into start/end date boundaries.
- `readAndParseLogFiles(files)` — Reads NDJSON from multiple files into a single array, skipping malformed lines.
- `applyLogFilters(logs, filters)` — Applies `appName`, `log_id`, `level`, and time range filters.
- `getISOWeekNumber(date)` — ISO 8601 week number calculation.
- `getDateFromISOWeek(year, week)` — Returns the Monday of a given ISO week.

## 7. Diagnostics Logging (Nile Internals)

Nile's internal modules (server, engine, REST) use a separate diagnostics logging system that is distinct from this module. The `createDiagnosticsLog` utility in `src/utils.ts` provides centralized diagnostic output:

```typescript
import { createDiagnosticsLog } from "@/utils";

const log = createDiagnosticsLog("Engine", {
  diagnostics: config.diagnostics,
  logger: nileContext.resources?.logger,
});

log("Initialized in 2ms. Loaded 3 services.");
```

**Behavior:**
- When `diagnostics` is `false` (or absent), returns a no-op function
- When `diagnostics` is `true`, checks `resources.logger` first, falls back to `console.log`
- The prefix (e.g. `"Engine"`) is automatically prepended as `[Engine]`

This replaces the previous pattern where `server.ts`, `rest.ts`, and `engine.ts` each defined their own inline `log()` closures.

## 8. Constraints

- **MODE required** — `createLog` throws if `process.env.MODE` is not set (lazy-evaluated on first log call, not at import time)
- **appName required** — `createLog` throws if `log.appName` is missing
- **Chunked getLogs requires appName** — Without `appName`, chunked mode returns an empty array (no directory to scan)
- **No concurrent write safety** — In test mode, uses `appendFileSync`. In production, pino handles buffering. No file-level locking is implemented.
- **Pino transport per call** — In production, `createLog` creates a new pino transport for each log entry. Callers writing many logs should use `createLogger` and consider caching.

## 9. Failure Modes

- **Missing MODE** — Throws `"Missing MODE environment variable"` on first `createLog` call
- **Missing appName** — Throws immediately with the stringified log object for debugging
- **Malformed log lines** — `getLogs` silently skips lines that fail `JSON.parse` (NDJSON tolerance)
- **Missing log directory** — Created automatically on first write (`mkdirSync` with `{ recursive: true }`)
- **Unparseable chunk filenames** — `isChunkRelevant` returns `true` (includes the file to be safe rather than silently dropping data)
