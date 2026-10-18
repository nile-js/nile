# Encore explicit durability profiles

The user chose WAL/NORMAL for the main comparison and separate targeted FULL checks. The generic operation helper keeps FULL as its default; the coordinator passes NORMAL explicitly.

Encore's launcher now forwards `config.sqliteSynchronous` into both host seed creation and its explicit mounted JSON. The shared config reader validates `full|normal`, and each actual worker connection sets/verifies the corresponding PRAGMA (FULL=2, NORMAL=1). Readiness metadata records the choice and actual storage settings. Documentation explains the profiles and their distinct crash durability.

Both production raw fixtures were rebuilt using the genuine Encore compiler and the existing pinned Node 24.16.0 base. The first validated attempt failed only because the official builder could not resolve `curl.se` to download its CA bundle. The failed log is preserved; retrying only validated succeeded without a network shim, binary patch or alternative server. `normal-config-production-builds.json` records final image identities, source hashes and successful compiler logs. The previous FULL build evidence remains unchanged.

The owned build daemon PID 300984 was verified against the exact suite executable, received SIGTERM and exited. No unrelated process was stopped. No listeners or timed measurements were started by this task.

Launcher readiness retries only explicit connection refusal before the listener is available. Timeouts, HTTP errors and output mismatches fail startup immediately so an ambiguous SQLite probe cannot be repeated. The single successful probe remains outside measured counts. Owned-container shutdown verifies actual exit, handles creation races, and exposes runtime exit to the coordinator.

Modified here: `suite/shared/encore-process.mjs` and `suite/encore/README.md`. Related shared helper/config/test changes belong to the fixture agent. Existing launcher, documentation and prior build evidence were backed up under `/home/kizz/CODE/new-nile/backup/benchmark-encore-normal-2026-10-17`, with intent. New evidence files were added; nothing was deleted.

Focused shared profile/config/storage tests passed for both FULL and NORMAL before builds. Syntax checking and a pre-aborted launch check pass. Native HTTP/storage smoke checks and timed loads belong to the parent runner; successful compilation alone is not a performance result.
