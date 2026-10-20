export interface Log {
  atFunction: string;
  appName: string;
  message: string;
  data?: unknown;
  level?: "info" | "warn" | "error";
  log_id?: string;
  requestId?: string;
  traceId?: string;
  spanId?: string;
  runId?: string;
}

export interface LogReaderConfig {
  chunking?: "monthly" | "daily" | "weekly" | "none";
}

export interface LoggerConfig extends LogReaderConfig {
  /** Runtime mode — controls how logs are output */
  mode: "prod" | "dev" | "agentic";
}

export interface LogFilter {
  requestId?: string;
  runId?: string;
  traceId?: string;
  appName?: string;
  log_id?: string;
  level?: "info" | "warn" | "error";
  from?: Date;
  to?: Date;
}
