# Encore native benchmark fixtures

Three independent Encore apps register the same 300 literal POST paths, `/actions/action-0` through `/actions/action-299`:

- `plain`: native `api.raw`, JSON decoding and response encoding, no field validation.
- `validated`: native `api.raw` with the suite's common Zod 4.6.7 validation.
- `native`: typed `api` endpoints with Rust field/bounds validation, then JS integer guards. Encore's numeric tags do not express the complete safe-integer constraint; the guards retain the exact comparison contract.

Each app has one `actions` service and ten route declaration files. Literal exported endpoint definitions are necessary for Encore's static compiler. No database, secret, auth handler or external cloud resource is declared. The apps are local and unlinked (`encore.app` is `{}`). Dependencies resolve from the enclosing suite installation; each app also records its exact direct dependency requirements.

The user starts all listeners. Once an actual Encore CLI 1.58.6 is installed, run from the selected app directory:

```sh
encore run --watch=false --listen=127.0.0.1:4109 --browser=never
```

This is the **development runtime**, including Encore's local instrumentation, and must be labelled as such. For a production comparison, use the documented `encore build docker` path and have the user start the resulting image. Do not present development results as a production framework ranking. Neither command has been run by the agent.

The official CLI installer returned HTTP 403 in this environment. GitHub release v1.58.6 lists no assets, and a release archive path derived from the official release configuration also returned HTTP 403. No binary download or checksum was verified. Native compiler/runtime verification is therefore pending; these fixtures must not be reported as a measured Encore result until it succeeds.

TS7 strict checking resolves the fixture types but currently encounters two upstream SDK errors at `encore.dev/api/node_http.ts:36` and `:150`: its `DummySocket` assertions conflict with Node type definitions. Initially the installed newest Node types required `Socket.server`; pinning Node 24.19.2 types to match the runtime instead reveals incompatible `setKeepAlive` overloads at the same two locations. These SDK `.ts` sources are outside `skipLibCheck` coverage. No dependency source was patched. Native compiler checking is still required.

Sources: [raw API](https://encore.dev/docs/ts/primitives/raw-endpoints), [typed API](https://encore.dev/docs/ts/primitives/defining-apis), [validation](https://encore.dev/docs/ts/primitives/validation), [CLI flags](https://encore.dev/docs/cli/cli-reference), [production builds](https://encore.dev/docs/self-host/build), [runtime architecture](https://encore.dev/blog/rust-runtime).
