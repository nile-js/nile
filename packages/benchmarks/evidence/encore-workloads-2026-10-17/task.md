# Encore workload integration

Original intent: include genuine Encore in current-framework memory/SQLite read/read-write comparisons, preserve identical response validation and avoid leftover benchmark processes. The user authorized isolated benchmark databases and necessary server startup.

## Scope and method

1. Audited and stopped the verified old Encore daemon; sampled host CPU/swap/listeners without stopping unrelated apps.
2. Preserved existing Encore fixture sources and wrote intent before changes.
3. Reused the shared operation helper through Encore's real raw transport. No custom substitute HTTP server or duplicate SQLite implementation was introduced.
4. Added explicit mounted JSON configuration and a host-seeded, marked shared database for Encore workers.
5. Added focused storage/config tests and rebuilt official production images against the exact existing Node base digest.
6. Added launcher lifecycle handling that verifies owned-container shutdown, handles startup interruption and preserves controlled logs/metadata.

## Files

Modified existing files:

- `suite/encore/plain/actions/workload.ts`
- `suite/encore/validated/actions/workload.ts`
- `suite/encore/README.md`

New source/test files:

- `suite/shared/encore-workload.mjs`
- `suite/shared/encore-process.mjs`
- `suite/tests/encore-workload.test.mjs`

Existing originals and intent are preserved under `/home/kizz/CODE/new-nile/backup/benchmark-encore-workloads-2026-10-17`. No files were deleted. Compiler-generated `.encore/build` output and local production image tags were refreshed; immutable resulting image IDs and source hashes are in `production-builds.json`.

## Evidence and boundaries

The existing 300-route, JSON transport and Zod guard tests pass. Four new cases exercise real memory/SQLite operations, committed write counters and malformed configuration. A pre-aborted launcher fails before creating a database or container. Syntax checking passes. Production compiler logs and immutable image identities accompany this document.

Native HTTP readiness/storage smoke verification belongs to the parent runner; this task did not invoke the launcher or generate timed loads. The launcher checks actual container Node version and a native HTTP response before admitting measurements. Its stop path records the final SQLite write counter. Full runtime success must be confirmed before reporting cross-framework performance.

The host process audit found no zombies or running benchmark containers/listeners, but the desktop was still 52.42% busy over ten seconds. These observations cannot support a quiet publication benchmark claim. Third-party command-line arguments are excluded from persisted audit evidence.

## Reflection

The simplest shared operation helper kept database semantics identical across frameworks and avoided a fake Encore path. Focused storage tests exposed a configuration parsing mistake before image use; it was corrected and both final images rebuilt. Read-only review caught cancellation/cleanup gaps, which were fixed before launch. Production runtime smoke tests and quiet-host gating remain necessary; passing source tests alone is insufficient.
