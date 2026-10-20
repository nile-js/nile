# Roadmap

Nile’s current focus is helping small teams maintain a growing application through predictable services, actions, validation and failure handling. The guides describe shipped behavior; this page describes possible future work.

## Under consideration

- **Action-level streaming:** an explicit protocol for incremental action output, including possible SSE support. Custom HTTP routes can already return streaming responses; that is a separate capability.

These are directions, not implemented APIs or delivery commitments. Direct action calls and WebSocket action calls are documented in [production operations](/guide/reference/operations).

## Available today

Bun native and the Hono compatibility adapter, functional services/actions, validation, Results, context, hooks and opt-in discovery form the foundation. [Production operations](/guide/reference/operations) covers direct calls, WebSockets, lifecycle, bounded execution controls, Croner schedules and optional OpenTelemetry-backed diagnostics.

The [benchmark suite and recorded measurements](/guide/reference/performance) are available, including setup instructions and raw data. Future comparisons may examine different workloads or each framework’s native validation path; the current shared-Zod comparison has its own stated boundaries.

Check [repository issues](https://github.com/nile-js/nile/issues) for current discussion. Priorities may change as real applications expose new needs.
