import type { AuthContext } from "../auth/types";
import type { RateLimitStore } from "../controls/rate-limit-types";
import type { Engine } from "../engine/types";

export type ExecutionTransport = "rest" | "rpc" | "ws" | "cron";
export interface ExecutionContext {
  traceId?: string;
  spanId?: string;
  requestId: string;
  transport: ExecutionTransport;
  signal: AbortSignal;
  clientKey?: string;
  headers?: Headers;
  job?: string;
  runId?: string;
}
export interface InvokeOptions {
  service: string;
  action: string;
  payload: Parameters<Engine["executeAction"]>[2];
  signal?: AbortSignal;
  requestId?: string;
  /** Raw credentials are verified by the existing JWT handler when configured. */
  credentials?: AuthContext;
  /** Trusted backend code supplies application sessions; this never skips configured JWT checks. */
  session?: Record<string, string | number | boolean | null>;
  clientKey?: string;
}
export interface ExecutionDetails {
  hook?: string;
  service: string;
  action: string;
  context: ExecutionContext;
}
export interface ExecutionOutcome {
  success: boolean;
  durationMs: number;
}
export interface ExecutionSpan {
  run: <T>(fn: () => Promise<T>) => Promise<T>;
  end: (outcome: ExecutionOutcome) => void;
  traceId?: string;
  spanId?: string;
}
export interface NileTelemetry {
  start: (details: ExecutionDetails) => ExecutionSpan;
  flush: () => Promise<void>;
  shutdown: () => Promise<void>;
}
export interface ExecutionDiagnostics {
  hookTracing?: boolean;
  summaries?: boolean;
  slowMs?: number;
  telemetry?: NileTelemetry;
}
export interface ActionQuota {
  store: RateLimitStore;
  /** Called after configured authentication/global before hook, allowing identity-aware keys. */
  key: (details: ExecutionDetails) => string;
}
export interface ExecutionOptions {
  timeoutMs?: number;
  diagnostics?: ExecutionDiagnostics;
  /** Most specific service/action policy overrides broader policy; false disables an inherited quota. */
  rateLimit?: ActionQuota | false;
  services?: Record<
    string,
    {
      rateLimit?: ActionQuota | false;
      actions?: Record<string, { rateLimit?: ActionQuota | false }>;
    }
  >;
}
