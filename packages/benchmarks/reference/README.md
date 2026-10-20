# Recorded benchmark results

[Open the comparison](index.html). The charts show one entry per framework, sorted by average requests per second, with Nile highlighted in sky blue. [Raw results](results.json) and [derived rankings](rankings.json) retain the measurements and their provenance.

The source run contains six rounds of a broader historical matrix. The charts select the ten framework setups documented in the [benchmark instructions](../README.md), retaining all six samples per setup and validation mode. The raw file also retains the other historical variants for audit. No samples were removed because they were slow.

The workload has 300 authenticated ecommerce operations, in-memory state, 32 concurrent shopping journeys, 500 warmup journeys and 5,000 measured six-request journeys per sample. Results were collected on an Intel Core i5-6300U machine with four logical CPUs and about 15.5 GiB RAM while the desktop remained in use. Variation is included in the rankings; these averages do not establish universal framework performance.

These measurements predate the version-only bump to Nile 1.0.0. The original build hashes, versions and timestamps remain in the raw data. Regenerate the presentation from the repository root:

```sh
bun packages/benchmarks/suite/ecommerce/full/rank-results.mjs packages/benchmarks/reference/results.json packages/benchmarks/reference
python3 packages/benchmarks/suite/ecommerce/full/render-chart.py packages/benchmarks/reference/rankings.json
```

Install Pillow as described in the benchmark instructions first. Rendering does not rerun measurements.

[Published-package comparison](npm-comparison.json) records a separate three-round run against npm 0.0.17: current Nile native averaged about 1.25× its throughput without payload Zod validation and 1.31× with validation. The comparison used whole installed packages, including their different dependency resolutions. This is an observed result on this PC, not a 10× claim or a code-only measurement.
