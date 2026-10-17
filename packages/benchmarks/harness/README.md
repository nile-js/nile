# External HTTP benchmark runner

This dependency-free Node 24 runner sends requests to servers **you start manually**. It never starts a server, creates a listening socket, installs packages, or spawns a process. Tests need no server.

Copy `manifest.example.json` to your own manifest and fill exact package/runtime versions and endpoints. The example demonstrates three protocol shapes; add every actual framework endpoint to the same manifest. Run plain and validated workloads separately against matching fixture modes. Production source revisions, lockfile hashes, framework startup commands, adapter choices, and runtime settings must accompany published results; manifest labels are declarations, not automatic verification of remote servers.

```sh
node --test benchmarks/harness/harness.test.mjs
node benchmarks/harness/run.mjs --manifest /absolute/path/run-manifest.json --output /absolute/path/new-results.json
```

The output file must not already exist, and its parent directory must exist. Partial evidence is saved atomically after every phase. A crash or interruption leaves `completed: false`; this is not a completed benchmark. Do not run multiple benchmark runners or compilers on the same host during measurement.

## Fixture contract

Each framework registers 300 independent actions, numbered 0 through 299. Every request has the JSON payload `{ "id": sequence, "value": sequence % 1000 }`. Its terminal response is `{ "id": sequence, "value": value + 1, "action": actionIndex }`. Including the action identity detects misrouting. Validated mode must enforce the same constraints: `id` is a nonnegative safe integer and `value` is an integer from 0 through 999. Plain mode omits input validation for every framework.

| Codec | POST path | Native request body | Native response |
| --- | --- | --- | --- |
| json | `/actions/action-{action}` | payload | terminal object |
| nile | `/api/services` | `{intent:"execute",service:"bench",action:"action-N",payload}` | `{status:true,data:terminal}` |
| trpc | `/trpc/action-{action}` | payload, default JSON transformer | `{result:{data:terminal}}` |

Use distinct endpoint ports and accurate runtime labels. The runner rotates all 300 actions by request sequence, resets the sequence each phase, and uses POST with JSON throughout. No query batching, custom tRPC transformer, authentication, database, network dependency, or logging should be enabled in only one fixture. This suite measures dispatch, optional matched validation, protocol envelopes, and serialization. It does not represent the broader capabilities of architecture frameworks.

## Measurement

Supported concurrencies are 1, 30, 100, and 300. Every worker has one outstanding request, using HTTP/1.1 keepalive with up to `concurrency` sockets. The same client/connection pool runs warmup and the following measurement. Pools close between framework/concurrency trials. Five complete rounds use a seeded Fisher-Yates order across framework/concurrency pairs, recorded as the actual ordered raw phases.

This is a closed-loop saturation test: request arrivals slow when responses slow. Latency percentiles therefore do not model a fixed external arrival rate and are not corrected for coordinated omission. Report that distinction alongside the throughput and latency figures.

The `development` example is a short harness check. For shareable evidence set `profile: "publication"`, `durationSeconds: 30` or greater and `warmupSeconds: 5` or greater; the runner enforces these minima and exactly five rounds. With nine frameworks and four concurrencies, 30s measurement plus 5s warmup takes at least 105 minutes. Start with a development run, then run the complete publication matrix while the machine is otherwise idle.

The generator stops issuing requests at the duration deadline and drains in-flight responses. Throughput divides all completions by the actual elapsed duration including drain, which is recorded separately. Successful throughput excludes failures. Deadlines cover each request from dispatch to response consumption. Non-200 responses, payload mismatches/invalid JSON, timeouts, transport failures and responses over 64KiB are counted; failure categories may overlap, but the failed-request total counts their union. Every returned JSON body is checked, including non-200 responses. A trial is invalid with any failures, no requests, or incomplete 300-action coverage. Warmup failures invalidate the overall run. No ranking is generated.

Latencies cover request dispatch through full body consumption, then correctness validation occurs before each worker issues its next request. Every request latency, including failures, enters a bounded histogram at 0.1ms resolution; percentiles are upper bucket edges with at most 0.1ms quantization. Raw sparse histograms and all trial counts are retained. JSON parsing/correctness checks consume generator CPU and can limit measured throughput.

Request and response **body** bytes include native JSON envelopes. Request bytes count attempted submissions even on network errors. These are not wire-byte measurements: HTTP headers, TCP/TLS overhead, compression, and retransmissions are excluded. Responses are not compressed by this harness.

Machine CPU/OS/memory, generator Node/runtime versions, original manifest, SHA-256 manifest hash, timestamps, raw phases and overall validity are recorded. Endpoint runtime versions are supplied in the manifest and should be independently verified in fixture setup. The generator may share the server host; monitor CPU and repeat with a separate load generator before making capacity claims. These results cannot establish a universal “fastest TypeScript framework” claim.

## Implementation and review

Protocol adapters, manifest checks, latency statistics, HTTP transport and trial accounting are separate small modules. Pure tests cover native envelopes, routing identity, malformed responses, validation, deterministic shuffle, quantiles and injected adapter failures without listening sockets. New files only were created, so there were no originals to back up. A future improvement is CPU-isolated generator and server hosts; the current implementation deliberately records the shared-host limitation rather than assuming isolation.
