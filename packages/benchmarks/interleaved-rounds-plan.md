# Correct round ordering and desktop-bias review

Owner intent: run every framework in round 1, then every framework in round 2, then round 3, and average all three. Rerun Nile and scenarios that may have been biased while the PC was busy.

1. Stop the owned sequential series safely; restore temporarily paused development work. Preserve raw contiguous-repeat evidence and its interruption status.
2. Audit completed per-scenario spreads using `(fastest / slowest - 1) * 100`. Flag spreads >=20%, inspect host/resource evidence, and flag conspicuous cross-mode anomalies separately. This criterion is a practical rerun trigger, not proof of causation.
3. Rerun all six Nile scenarios, flagged completed scenarios, and unfinished Node scenarios. Preserve the original results beside corrected results rather than mixing individual repeats or selecting a better score.
4. Run outer rounds 1..3. In each round, run every selected framework, with each selected workload once. Seeded framework ordering rotates across rounds. Each trial gets a fresh process, fresh isolated DB where required, preflight, warmup, exact budget, response checking and persisted-write verification.
5. Keep three round identities and all means/ranges. Corrective scenarios retain the original per-repeat request allocations; a subset correction is explicitly not a new complete 1M-per-framework run. Bun primary/component comparisons are fresh full 1M runs with corrected ordering; FULL remains the separately labelled 18K run.
6. Test scheduling and aggregation, then run. Archive raw evidence, the selection and reason for each rerun, protocol hashes and limitations. Complete report/docs, cleanup and authorized commit/push afterward.

The original count runner remains available for reproducing its historical protocol. The corrected coordinator reuses the existing native fixtures, exact-budget harness, lifecycle controls, telemetry and correctness checks. No Nile core implementation changes are included.
