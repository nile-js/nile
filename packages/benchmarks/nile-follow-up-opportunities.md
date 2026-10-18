# Nile follow-up performance opportunities

Scope: observations from the current source while the request-count comparison runs. These are candidates for profiling and owner review, not implemented changes or measured explanations of a throughput gap.

The current engine already uses a two-level object lookup for service/action selection. Registering 300 actions does not imply scanning 300 actions on every call. End-to-end HTTP cost still includes request decoding, the RPC envelope, context isolation, action execution and response serialization.

| Candidate | Current flow | What to measure before proposing a change |
|---|---|---|
| Request-envelope parsing | rest/rest.ts parses JSON, then uses externalRequestSchema.safeParse; payload is a Zod record even when action validation is absent. | Allocation/CPU share of envelope parsing versus action validation. Preserve accepted input, sanitization and error responses. |
| Async/result boundaries | engine/engine.ts awaits pipeline.runHandler; runHandler awaits slang-ts safeTry and creates another successful Result. | Promise and Result allocation cost with synchronous and asynchronous handlers, nested Results and thrown/rejected failures. Preserve recursive Slang semantics and crash handling. |
| Diagnostic formatting | The REST execution path constructs a diagnostic string before calling the logger, including when diagnostics are disabled. | Profile whether disabled-log formatting is material before adding branching or a lazy-message API. |
| Request/action scopes | Every HTTP request enters a request scope; every action enters a child action scope. | Cost of scope creation and hook-state allocation. Any reduction must preserve concurrent, nested, global-hook and direct-engine isolation. |
| Empty middleware path | The Hono middleware runner remains registered and calls next when no user middleware exists. | Compare against a faithful Hono control with matching CORS, envelopes, context and error handling. Dynamic middleware registration must continue working. |
| Response envelope | Successful execution maps its Result into Nile's public status/message/data response and serializes it. | Match response bytes in an additional control to distinguish protocol work from dispatch overhead. Do not silently change the public API for a score. |

The matched Bun/Hono/Nile track measures complete stacks with the same business operation; it does not independently attribute every layer's cost. Native runtime, driver and framework differences must remain visible. A universal fastest-framework claim requires broader hardware, independent load generators and repeatable external validation.

No core code or configuration was changed for these observations. Next steps should follow actual profiles and the final measurements, with approval for any core implementation changes.
