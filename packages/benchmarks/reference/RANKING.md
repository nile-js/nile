# Framework throughput ranking

One entry per framework; all 6 samples per setup and mode retained. No new measurements were run and no individual outliers were removed.

One declared setup per framework: Nile, Hono, Elysia and Effect use Bun; NestJS uses Fastify on Node; Express, Fastify, AdonisJS and tRPC use Node; Encore uses its production Node+Rust image. Runtime selection is explicit; individual favorable samples are never selected.

Tables sort by arithmetic mean requests/sec. ‘Leader ÷ this’ and ‘Nile ÷ this’ are throughput ratios for this recorded workload.

## Payload validation off

| Rank | Framework | Average req/s | Leader ÷ this | Nile ÷ this |
|---:|---|---:|---:|---:|
| 1 | Hono | 7,617 | 1.00× | 0.98× |
| 2 | Nile | 7,479 | 1.02× | 1.00× |
| 3 | Elysia | 7,266 | 1.05× | 1.03× |
| 4 | Effect | 5,468 | 1.39× | 1.37× |
| 5 | Fastify | 2,860 | 2.66× | 2.61× |
| 6 | NestJS | 2,406 | 3.17× | 3.11× |
| 7 | AdonisJS | 2,223 | 3.43× | 3.36× |
| 8 | Express | 2,002 | 3.80× | 3.74× |
| 9 | tRPC | 1,390 | 5.48× | 5.38× |
| 10 | Encore | 667 | 11.42× | 11.21× |

## Shared Zod payload validation on

| Rank | Framework | Average req/s | Leader ÷ this | Nile ÷ this |
|---:|---|---:|---:|---:|
| 1 | Nile | 7,290 | 1.00× | 1.00× |
| 2 | Hono | 7,067 | 1.03× | 1.03× |
| 3 | Elysia | 6,797 | 1.07× | 1.07× |
| 4 | Effect | 5,343 | 1.36× | 1.36× |
| 5 | Fastify | 2,790 | 2.61× | 2.61× |
| 6 | NestJS | 2,302 | 3.17× | 3.17× |
| 7 | AdonisJS | 2,001 | 3.64× | 3.64× |
| 8 | Express | 1,729 | 4.22× | 4.22× |
| 9 | tRPC | 1,295 | 5.63× | 5.63× |
| 10 | Encore | 668 | 10.91× | 10.91× |

## Scope

6 samples per contender per mode, arithmetic mean, descending throughput. All completed samples retained. Same 300-operation authenticated in-memory ecommerce workload and common Zod validation modes.

Observed ranking from an actively used PC. Ratios describe this run, not proven universal framework speed differences. Close means and overlapping ranges do not establish a reliable winner.

JWT and CORS remain enabled. Validation off disables payload Zod only; Nile retains protocol-envelope checks. Every framework uses the same payload schemas. State is in memory; this is not a database benchmark. Runtime and adapter choices affect the comparison.

Source: [original results](<results.json>). [Machine-readable rankings and ratios](rankings.json) include ranges, medians and the exact source hash.
