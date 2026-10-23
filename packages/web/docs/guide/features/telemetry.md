---
title: "Telemetry"
description: "Send action traces and metrics from Nile Js to an OpenTelemetry collector over OTLP HTTP"
---

Telemetry sends a span for each action or scheduled job, plus bounded metrics, to an OpenTelemetry collector. Use it when your team already reads traces and metrics in a tool such as Grafana, Honeycomb or Jaeger. Nile Js does not include a dashboard.

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

`createNileTelemetry` loads the OpenTelemetry packages only when you call it. A server that does not call it does not load them.

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
- Metrics use bounded labels. Request IDs go on spans and logs, not on metric labels, so metric cardinality stays low.
- Nile does not capture payloads, tokens, raw errors or personal data. Anything you write into a log `data` object is still your responsibility.

## Limits

- The collector is a separate service. If it is unreachable, Nile logs export errors and the action still returns its normal Result.
- Calling `telemetry.flush()` while the collector is unreachable rejects. Wrap a manual flush in `try` and `catch`, and log the failure.
- Export uses bounded buffers and deadlines, so a slow collector does not hold up requests.

## Common mistakes

- Putting a collector token directly in source code. Read it from an environment variable through your configuration module.
- Expecting a Nile dashboard. Point the endpoint at a collector that your team already uses.
- Setting `hookTracing` on every service. Hook spans add volume, so enable it while you diagnose a specific action.
- Using request IDs as metric labels in your own instrumentation.

## See also

- [Production operations](/guide/reference/operations) covers the diagnostics options and log filters.
- [Logging](/guide/internals/logging) explains the file logs that telemetry complements.
- [Context and logging](/guide/features/context-and-logging) shows how execution IDs appear in logs.
