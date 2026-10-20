import { context, SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import {
  BasicTracerProvider,
  BatchSpanProcessor,
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
} from "@opentelemetry/sdk-trace-base";
import type { NileTelemetry } from "../execution/types";
import type { TelemetryOptions } from "./types";

let ownedManager: AsyncLocalStorageContextManager | undefined;
let managerUsers = 0;

/** Share context support without overwriting an application's existing global SDK. */
function acquireContext() {
  if (!ownedManager) {
    const candidate = new AsyncLocalStorageContextManager().enable();
    if (context.setGlobalContextManager(candidate)) {
      ownedManager = candidate;
    } else {
      candidate.disable();
    }
  }
  if (ownedManager) {
    managerUsers++;
  }
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    if (!ownedManager || --managerUsers > 0) {
      return;
    }
    context.disable();
    ownedManager.disable();
    ownedManager = undefined;
  };
}

const TRAILING_SLASH = /\/$/;

function validateOptions(options: TelemetryOptions) {
  if (!options.serviceName.trim()) {
    throw new Error("Telemetry needs a serviceName");
  }
  const sampleRate = options.sampleRate ?? 1;
  if (!Number.isFinite(sampleRate) || sampleRate < 0 || sampleRate > 1) {
    throw new Error("Telemetry sampleRate must be between zero and one");
  }
  if (!(options.endpoint || options.traceExporter)) {
    throw new Error("Telemetry needs an endpoint or traceExporter");
  }
  const base = options.endpoint ? new URL(options.endpoint) : undefined;
  if (
    base &&
    (!(base.protocol === "http:" || base.protocol === "https:") ||
      base.username ||
      base.password ||
      base.search ||
      base.hash)
  ) {
    throw new Error(
      "Telemetry endpoint must be an HTTP base URL without credentials, query or fragment"
    );
  }
  const metricsEnabled =
    options.metrics ??
    !!(base || options.metricExporter || options.meterProvider);
  if (
    metricsEnabled &&
    !base &&
    !options.metricExporter &&
    !options.meterProvider
  ) {
    throw new Error(
      "Metrics need an endpoint, metricExporter or meterProvider"
    );
  }
  return { base, sampleRate, metricsEnabled };
}

/** Create useful action traces and metrics with a destination, not a user-assembled SDK pipeline. */
export function createNileTelemetry(options: TelemetryOptions): NileTelemetry {
  const { base, sampleRate, metricsEnabled } = validateOptions(options);
  const endpoint = (signal: string) =>
    `${base?.toString().replace(TRAILING_SLASH, "")}/v1/${signal}`;
  const resource = resourceFromAttributes({
    "service.name": options.serviceName,
    "telemetry.distro.name": "nile",
  });
  const provider = new BasicTracerProvider({
    resource,
    sampler: new ParentBasedSampler({
      root: new TraceIdRatioBasedSampler(sampleRate),
    }),
    spanProcessors: [
      new BatchSpanProcessor(
        options.traceExporter ??
          new OTLPTraceExporter({
            url: endpoint("traces"),
            headers: options.headers,
            timeoutMillis: 3000,
          }),
        {
          maxQueueSize: 2048,
          maxExportBatchSize: 256,
          scheduledDelayMillis: 2000,
          exportTimeoutMillis: 3000,
        }
      ),
    ],
  });
  const metricProvider =
    metricsEnabled && !options.meterProvider
      ? new MeterProvider({
          resource,
          readers: [
            new PeriodicExportingMetricReader({
              exporter:
                options.metricExporter ??
                new OTLPMetricExporter({
                  url: endpoint("metrics"),
                  headers: options.headers,
                  timeoutMillis: 3000,
                }),
              exportIntervalMillis: 10_000,
              exportTimeoutMillis: 3000,
            }),
          ],
        })
      : undefined;
  const meter = metricsEnabled
    ? (options.meterProvider ?? metricProvider)?.getMeter("nile")
    : undefined;
  const count = meter?.createCounter("nile.action.executions");
  const duration = meter?.createHistogram("nile.action.duration", {
    unit: "ms",
  });
  const active = meter?.createUpDownCounter("nile.action.active");
  const tracer = provider.getTracer("nile");
  const propagator = new W3CTraceContextPropagator();
  const releaseContext = acquireContext();
  let stopped = false;
  let shutdown: Promise<void> | undefined;

  return {
    start(details) {
      if (stopped) {
        return { run: (fn) => fn(), end: () => undefined };
      }
      const attributes = {
        "nile.service": details.service,
        "nile.action": details.action,
        "nile.transport": details.context.transport,
      };
      let parent = context.active();
      // A locally active action remains the parent of nested direct calls.
      if (!trace.getSpan(parent) && details.context.headers) {
        parent = propagator.extract(parent, details.context.headers, {
          keys: (headers: Headers) => [...headers.keys()],
          get: (headers: Headers, key: string) => headers.get(key) ?? undefined,
        });
      }
      const span = tracer.startSpan(
        `${details.service}.${details.action}${details.hook ? `:${details.hook}` : ""}`,
        {
          kind:
            details.context.transport === "rest" ||
            details.context.transport === "ws"
              ? SpanKind.SERVER
              : SpanKind.INTERNAL,
          attributes: {
            ...attributes,
            "nile.request.id": details.context.requestId,
            ...(details.hook ? { "nile.hook": details.hook } : {}),
          },
        },
        parent
      );
      const scope = trace.setSpan(parent, span);
      const ids = span.spanContext();
      if (!details.hook) {
        active?.add(1, attributes);
      }
      let ended = false;
      return {
        traceId: ids.traceId,
        spanId: ids.spanId,
        run: (fn) => context.with(scope, fn),
        end(outcome) {
          if (ended) {
            return;
          }
          ended = true;
          span.setStatus({
            code: outcome.success ? SpanStatusCode.OK : SpanStatusCode.ERROR,
          });
          span.end();
          const completed = {
            ...attributes,
            "nile.outcome": outcome.success ? "success" : "failure",
          };
          if (details.hook) {
            return;
          }
          active?.add(-1, attributes);
          count?.add(1, completed);
          duration?.record(outcome.durationMs, completed);
        },
      };
    },
    async flush() {
      if (stopped) {
        return;
      }
      await Promise.all([provider.forceFlush(), metricProvider?.forceFlush()]);
    },
    shutdown() {
      stopped = true;
      shutdown ??= Promise.allSettled([
        provider.shutdown(),
        metricProvider?.shutdown(),
      ]).then((results) => {
        releaseContext();
        if (results.some((result) => result.status === "rejected")) {
          throw new Error("Telemetry shutdown failed");
        }
      });
      return shutdown;
    },
  };
}
