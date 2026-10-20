import type { MeterProvider } from "@opentelemetry/api";
import type { PushMetricExporter } from "@opentelemetry/sdk-metrics";
import type { SpanExporter } from "@opentelemetry/sdk-trace-base";

export interface TelemetryOptions {
  serviceName: string;
  /** OTLP HTTP base URL; Nile adds /v1/traces and /v1/metrics. */
  endpoint?: string;
  headers?: Record<string, string>;
  sampleRate?: number;
  metrics?: boolean;
  /** Advanced integrations can supply exporters without replacing Nile's everyday API. */
  traceExporter?: SpanExporter;
  metricExporter?: PushMetricExporter;
  meterProvider?: MeterProvider;
}
