# Nile optimization evidence — October 17, 2026

These archived raw trials support [the performance report](../../../performance-optimizations-report.md). They compare the safe stats-and-isolation build before optional-phase/middleware optimization against the final build, using identical installed dependencies. They do not compare the published release with current Nile, nor compare different frameworks.

The schema cases compare cache disabled/enabled on the same final artifact. Metadata, per-trial throughput/latencies, full ranges, correctness counts, runtime and machine information are included. All nine cases and ninety trials are retained, including wide ranges. No production capacity or global fastest-framework claim follows from these in-process results.

The manifest records source/artifact hashes. Original scripts, baseline source snapshots and generated variants remain in the local project backup under `backup/performance-optimizations-2026-10-16/measurements/`. Their absolute local paths require adapting before reuse. The forthcoming cross-framework suite will use repository-relative configuration and external HTTP measurement.
