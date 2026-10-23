---
title: "Performance and methodology"
description: "Read the recorded shopping-workflow results and reproduce the comparison"
---

A growing backend needs to do more than return hello world. This comparison runs an authenticated ecommerce workflow across 300 business operations: 50 shops with catalog, product, cart, quote, checkout and order operations.

The results below describe one recorded workload on an actively used PC. They are not maximum-throughput measurements or a universal ranking of frameworks. Choose an application structure your team can maintain, and measure your own workload before making capacity decisions.

[Chart: six-round ecommerce throughput averages with shared Zod payload validation enabled](/benchmarks/benchmark-validated.svg)

## Recorded results

All six samples per selected framework and validation mode are retained. The table uses arithmetic mean requests per second; ranges and coefficient of variation show how much the samples moved. Close averages with overlapping ranges do not establish a reliable winner.

| Framework | Average req/s | Range across six rounds | Variation (CV) |
| --- | ---: | ---: | ---: |
| Nile | 7,290 | 6,194–7,964 | 9.5% |
| Hono | 7,067 | 6,140–8,105 | 10.3% |
| Elysia | 6,797 | 3,405–8,128 | 23.6% |
| Effect | 5,343 | 4,790–5,644 | 5.7% |
| Fastify | 2,790 | 1,553–3,369 | 23.2% |
| NestJS | 2,302 | 1,068–3,067 | 32.7% |
| AdonisJS | 2,001 | 1,269–2,534 | 27.2% |
| Express | 1,729 | 940–2,376 | 36.8% |
| tRPC | 1,295 | 680–1,518 | 22.4% |
| Encore | 668 | 635–680 | 2.3% |

[Payload validation off chart](/benchmarks/benchmark-no-payload-validation.svg) · [Raw measurements](/benchmarks/results.json) · [Derived rankings and ratios](/benchmarks/rankings.json)

## What happened

Each framework exposed the same business operations using its own HTTP stack. Nile addressed 300 named actions through one POST endpoint. A fresh application process handled each sample; a separate Bun process generated requests on the same machine.

Before timing, the runner checked all 300 operations, authentication rejection, payload validation, CORS behavior and state accounting. It then sent 500 practice shopping journeys, cleared their state and measured 5,000 journeys with up to 32 concurrent shoppers. Each journey made six dependent requests, checked every response and ended in an order. Final state had to contain 5,000 orders and no pending carts.

Every contender ran in each round before the next round started. The starting contender rotated, and validation-mode order alternated. Results were saved after each sample; individual slow samples were not discarded. Warmup and coordination requests were outside the measured counts.

JWT and CORS remained enabled. The two modes toggle the shared Zod payload schemas. Nile still validates its protocol envelope in both modes. Data lives in memory: no database, disk durability, external payment service or production network was measured.

## Machine and versions

- Intel Core i5-6300U at 2.40 GHz, four logical CPUs, about 15.5 GiB RAM.
- Bun 1.4.2 and Node 24.16.0. Framework versions, dependency pins, hashes and actual runtime details are retained in the raw results and benchmark locks.
- Recorded October 2026. Desktop applications remained active; client and application shared CPU and memory. That contention limits conclusions about small differences.
- Nile used the optimized local Bun native build. The recorded raw provenance predates its version-only bump to 1.0.0; the framework JavaScript build hash was unchanged by that bump.

## Adapter and validator choices matter

The selected chart has one entry per framework: Nile, Hono, Elysia and Effect use Bun; Express, Fastify, NestJS with Fastify, AdonisJS and tRPC use Node; Encore uses its genuine compiled production Node/Rust image. The raw historical matrix also retains additional variants. The current reproduction runner selects these ten entries.

Shared business logic and Zod schemas keep application behavior comparable, but they do not exercise each framework's most optimized native validation path. In particular, the Encore fixture uses `api.raw`, JavaScript body parsing and Zod rather than compiled typed-endpoint validation in Rust. Elysia also uses the common Zod path. tRPC retains its native procedure and response envelopes. Common authentication uses the same JWT verifier.

These are real measurements of these particular adapters and this workflow. They do not support a claim that Nile is universally the fastest framework, or that the chart measures every framework at its best. Framework-owned hello-world or native-validator benchmarks answer a different question. Encore's [published methodology](https://encore.dev/blog/event-loops), for example, uses different validators and selects the best of five runs.

## Reproduce or inspect the comparison

The [benchmark README and setup script](https://github.com/nile-js/nile/tree/main/packages/benchmarks) describe the supported Linux x64 host, locked dependencies, verified Encore compiler and real production image build. No application database is required.

From the repository root:

```sh
bun packages/benchmarks/suite/setup.mjs
bun packages/benchmarks/suite/setup.mjs --check
NODE_ENV=production bun packages/benchmarks/suite/ecommerce/full/run.mjs --smoke
NODE_ENV=production bun packages/benchmarks/suite/ecommerce/full/run.mjs --rounds=6
```

The smoke run checks behavior without timed load. A fresh six-round, ten-framework run measures 3.6 million requests plus warmup; allow ten minutes or more. Timestamped local results remain separate from these published historical measurements. The runner shuts down the servers and uniquely named containers it starts.

Generate rankings and charts using the commands in the benchmark README. Rankings reject incomplete rounds and inconsistent measured samples. The chart renderer verifies the raw source hash before rendering.

## Compared with the published package

A separate [three-round comparison against npm 0.0.17](/benchmarks/npm-comparison.json) measured the current native build at about 1.25 times the published package's throughput without payload validation, and 1.31 times with validation. Both ran on Bun, using whole installed packages and their resolved dependencies. This is an observation on this PC, not a tenfold improvement or a code-only measurement.

Performance supports the development workflow; it does not replace application design, database planning or production load testing. Continue with [application structure](/guide/start/application-structure) to see how growing business operations stay navigable.
