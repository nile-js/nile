# Nile 1.0.3 migration notes

No runtime API changes from 1.0.2. This patch synchronizes the workspace Bun lockfile with Slang 0.2.2 and fixes the docs deployment install location. The package README now reflects the current startup checks and action response contract.

If updating from a version before 1.0.2, apply the notes below.

## Changes introduced in 1.0.2

This release preserves Nile's HTTP envelope: exactly `status`, `message`, and `data`.

- Slang is upgraded to 0.2.2. Import its utilities through `@nilejs/nile/fp`. Return Results directly: nested Results are rejected by Slang and contained at Nile-managed callback boundaries.
- `dbTry` and `DbTryOptions` are removed. Use `safeTry` and inspect `result.raw` internally, with `utils.describeError` for bounded diagnostics and `utils.handleError` for a safe caller message.
- Project structure violations fail startup by default. Select `project.structure: "warn"` explicitly to continue, or `false` to disable checking.
- `raw` is reserved for internal diagnostics and removed recursively from outbound JSON, including custom JSON Responses and Socket.IO messages. Rename public fields named `raw`. HTTP JSON responses are buffered to enforce filtering.
- The default success message is `Action completed.` Custom success and intentional Err messages retain their wording.
- Validation failures use Zod's prettified message or an explicitly provided validation message, with a generated unique `data.errorCode` and existing `data.issues`.
- Diagnostic errors use `Error Code: <generated-code> - <message>`, sharing the generated code with the log's `log_id`. Unexpected throws do not expose their original exception text.

Review these migration notes before updating an existing application to 1.0.2.
