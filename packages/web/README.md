# Nile documentation website

The public Nile site uses Rspress and React, with a custom landing page. It deploys under `/nile/` at https://nile-js.github.io/nile/.

## Work locally

```bash
bun install
bun run dev
```

For a production build and preview:

```bash
bun run build
bun run preview
```

The build checks internal documentation links and generates assistant documentation. Follow the repository's server and dependency approval rules when working with an agent.

## Edit the story and examples

- `docs/index.tsx` composes the landing page from focused sections in `components/home/`.
- `docs/home.css` loads the focused base, section and benchmark styles in `components/home/`.
- `theme/` preserves Rspress navigation/search and defines the shared brand/font tokens.
- `scripts/home-examples.ts` is the source for highlighted code and copy text. The build runs `scripts/generate-home-code.ts` to create `home-code-blocks.ts`; do not edit generated markup manually.
- `docs/guide/` contains the human guides. Each directory's `_meta.json` controls its reading order; `docs/_nav.json` controls top navigation.

Keep the copy grounded in small-team outcomes and shipped behavior. In-house production accounts are from the maintainers; do not add invented quotes, customer logos or performance promises.

## Benchmark evidence

The landing chart imports `../benchmarks/reference/rankings.json` directly. `docs/public/benchmarks/` exposes matching raw measurements and SVG exports for the performance guide. Do not hand-edit displayed values; derive presentation from the benchmark source and keep the public evidence synchronized. See the benchmark README for collection and chart-generation instructions.

The current shared-Zod comparison has explicit workload, machine, desktop-variation and adapter limitations. It is separate from an each-framework-native-validator comparison.

## Assistant documentation and assets

`@rspress/plugin-llms` generates `doc_build/llms.txt` and `llms-full.txt`. The postbuild step synchronizes them into `docs/public/`. From the Nile package, `bun run copy-docs` copies the built documentation into the package's `docs/` directory for release. Regenerate after changing the human guides.

`docs/public/fonts/` contains self-hosted Fira fonts with their SIL Open Font License. The mark and social sharing image are in `docs/public/`. Site assets and custom links must preserve the `/nile/` base.
