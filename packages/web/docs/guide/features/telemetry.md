---
title: "Telemetry"
description: "Send action traces and metrics from Nile Js to an OpenTelemetry collector over OTLP HTTP"
---

Send action and scheduled-job traces and metrics to an OpenTelemetry collector. Read them in your chosen tool, such as Grafana, Honeycomb or Jaeger.

## When to use it

Enable telemetry when you need to see which actions are slow or failing across replicas, or when you want a trace from an incoming request to the action it ran. Skip it when structured file logs answer your questions.

## Complete example

This server creates the exporter, passes it to the execution diagnostics and sets a timeout for each execution. The collector URL and token come from your configuration module.

```ts
import { createNileServer, createNileTelemetry, createServices } from "@nilejs/nile";

const telemetry = await createNileTelemetry({
  serviceName: "shop",
  endpoint: config.telemetryEndpoint,
  headers: { authorization: "Bearer replace-with-collector-token" },
});

const services = createServices([
  {
    name: "shop",
    description: "Storefront operations",
    actions: [],
  },
]);

export const server = await createNileServer({
  serverName: "shop",
  services: services,
  execution: {
    timeoutMs: 15_000,
    diagnostics: {
      telemetry: telemetry,
      summaries: false,
      slowMs: 1000,
      hookTracing: false,
    },
  },
  rest: { baseUrl: "/api", allowedOrigins: ["https://shop.example.com"] },
});
```

`createNileTelemetry` loads the OpenTelemetry packages when you call it, so a server without telemetry never loads them.

## Options that matter

| Where | Option | Effect |
| --- | --- | --- |
| `createNileTelemetry` | `serviceName` | Name shown for this application in the collector. |
| `createNileTelemetry` | `endpoint` | OTLP HTTP base URL. Nile adds `/v1/traces` and `/v1/metrics`. |
| `createNileTelemetry` | `headers` | Headers for the collector, such as an authorization token. Read them from configuration. |
| `createNileTelemetry` | `sampleRate`, `metrics` | Sampling for traces, and whether metrics are exported. |
| `execution.diagnostics` | `telemetry` | The instance returned by `createNileTelemetry`. |
| `execution.diagnostics` | `summaries` | When true, logs a summary of successful executions. Failures and slow executions are summarized when a logger is configured. |
| `execution.diagnostics` | `slowMs` | Executions at or above this duration are reported as slow. |
| `execution.diagnostics` | `hookTracing` | Adds a span for each hook. Off by default. |

## What is recorded

- Spans carry the action or job name, duration, outcome and transport. Standard incoming trace headers are propagated.
- Metrics use a fixed set of labels. Request IDs go on spans and logs only, which keeps the number of metric series small.
- Spans and metrics leave out payloads, tokens, raw errors and personal data. What you put in a log `data` object is logged as you wrote it.

## Limits

- The collector is a separate service. If it is unreachable, Nile logs export errors and the action still returns its normal Result.
- `telemetry.flush()` rejects while the collector is unreachable. Wrap a manual flush in `safeTry` and log the failure.
- Export uses size-limited buffers and timeouts, so a slow collector never holds up requests.

## Common mistakes

- Putting a collector token directly in source code. Read it from an environment variable through your configuration module.
- Looking for a Nile dashboard. Point the endpoint at the collector your team already uses.
- Setting `hookTracing` on every service. Hook spans add volume, so enable it while you diagnose a specific action.
- Using request IDs as metric labels in your own instrumentation.

## See also

- [Production operations](/guide/reference/operations) covers the diagnostics options and log filters.
- [Logging](/guide/internals/logging) explains the file logs that telemetry complements.
- [Context and logging](/guide/features/context-and-logging) shows how execution IDs appear in logs.
