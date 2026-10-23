# Nile Js website and documentation

The Nile Js site uses Fumadocs with React Router and Vite. It is pre-rendered to static files, so any static host can serve it. By default it builds for GitHub Pages at `https://nile-js.github.io/nile/`; see [Choose where the site is hosted](#choose-where-the-site-is-hosted) to publish it on its own domain.

## Work locally

```sh
bun install
bun run dev
```

Check and build before publishing:

```sh
bun run docs:check
bun run types:check
bun run lint
bun run build
bun run preview
```

The preview serves `http://127.0.0.1:4173/nile/`, or `http://127.0.0.1:4173/` for a build made for a domain root.

## Edit the website

- `app/routes/home.tsx` composes the homepage sections in `components/home/`.
- `app/app.css` defines the Fumadocs theme, typography and navigation. `docs/home.css` loads the homepage's focused styles.
- `docs/guide/` contains the human guides. Each directory's `meta.json` controls the reading order. Existing `/guide/...` URLs are preserved. Legacy `.html` bookmarks redirect to the canonical guide and retain the section anchor.
- `app/lib/source.ts` loads the Fumadocs collection. Guide bodies load on demand; the homepage does not import the guide collection.
- `scripts/home-examples.ts` holds homepage code and copy text. `scripts/generate-home-code.ts` highlights it into `home-code-blocks.ts` during the build.

Keep copy grounded in small-team outcomes and shipped behavior. In-house production accounts come from the maintainers. Use the recorded evidence for performance claims.

## Choose where the site is hosted

Two build-time variables decide the site's address. `site.config.ts` reads them for the app, the Vite and React Router configs and the build scripts, so moving the site needs no code change.

| Variable | Meaning | Default |
|---|---|---|
| `VITE_SITE_URL` | Origin used for canonical links, Open Graph tags, the sitemap and `robots.txt` | `https://nile-js.github.io` |
| `VITE_BASE_PATH` | Path the site is served under. Use `/` for the root of a domain. | `/nile` |

Build for a custom domain, such as `nilejs.dev`:

```sh
VITE_SITE_URL=https://nilejs.dev VITE_BASE_PATH=/ bun run build
VITE_BASE_PATH=/ bun run preview
```

Upload the contents of `doc_build/client/` to the host. With the default base path, upload `doc_build/client/nile/` instead.

The deploy workflow in `.github/workflows/deploy.yml` reads the `DOCS_SITE_URL` and `DOCS_BASE_PATH` repository variables (set them to `https://nilejs.dev` and `/`) and uploads the matching folder. When the domain changes, rebuild the docs and run `bun run copy-docs` in `packages/nile` so the `llms.txt` files shipped with the package point at the new address.

## Static output

React Router pre-renders HTML, route data, search and Markdown resources under the base path. `scripts/finalize-build.ts` combines those pages with Vite's public assets, then writes `sitemap.xml`, `robots.txt`, `404.html`, `.nojekyll` and the legacy `.html` redirects. The output serves without an application server.

`app/lib/site.ts` exposes the base path and site URL with `withBase` and `absoluteUrl` helpers. `app/components/provider.tsx` adapts Fumadocs navigation to React Router's basename so generated links, active navigation and search results all use the same URLs. Keep assets and downloads base-aware, and write internal links in guides as Markdown links (`/guide/...`), which are prefixed for you.

The former roadmap URL redirects to repository issues. A rendered `404.html` gives missing pages a path back to the guide.

## Search and assistant documentation

Search runs against a prebuilt browser index at `{base}/api/search`. Each guide exposes processed Markdown under `{base}/markdown/.../content.md` for the copy button and assistants.

The same collection produces `{base}/llms.txt` and `{base}/llms-full.txt`. Finalization refreshes the files in `doc_build/` and `docs/public/`. From the Nile package, `bun run copy-docs` copies those built files into the package's release documentation.

## Benchmark evidence

The homepage chart imports `../benchmarks/reference/rankings.json`. `docs/public/benchmarks/` exposes the corresponding raw measurements and SVG exports. Keep displayed values derived from those sources. The shared-Zod comparison documents its workload, machine, desktop variation and adapter limitations; it remains separate from a comparison using each framework's native validator.

## Fonts and assets

`app/fonts/` contains self-hosted Fira Sans and Fira Mono as WOFF2 files subset to Latin, punctuation, arrows and box drawing (about 67 KB in total, down from 850 KB of OTF). Their open font license is in `docs/public/fonts/Fira-LICENSE.txt`. The two Fira Sans weights are preloaded in `app/root.tsx`. The Nile mark and social sharing image live in `docs/public/`. No external font request is needed to render the site.

## Landing artwork and video

The hero uses an original river illustration in `docs/public/images/nile-river-hero.webp`. It fills the hero width, and a CSS elliptical mask gives it a curved lower edge that fades into the page. Decorative SVGs in `docs/public/images/` continue the theme: `nile-atmosphere.svg` (page-length glows and river current) and `nile-ripples.svg` (behind the hero logo and founder portrait). Feature cards and the footer stay plain. The header, footer, hero and favicon use `docs/public/nile-logo.svg`, a vector redraw of the official `nile-js` wave logo; `nile-logo.png` is a 512px render of it for PNG favicon and touch-icon fallbacks. Keep the self-hosted Fira fonts.

`components/home/video.tsx` embeds the supplied conversation with Hussein Kizza and Ssali Jonathan through YouTube’s privacy-enhanced player with `start=0`, so it always plays from the beginning. It loads lazily and has a direct watch link. The page order is hero, action/React walkthrough, benchmarks, creator story, video, built-in features, structure explorer and ecosystem. Displayed measurements still come from the existing recorded data.

The site is dark-only, including documentation, search and code examples. The Fumadocs provider forces dark mode, theme navigation is disabled, and no theme hotkey is registered. Homepage feature snippets are maintained in `scripts/feature-examples.ts` and shown on every bento card, titled with the feature's technical name in `components/home/feature-catalog.ts`; both walkthrough and feature examples are highlighted during the build. Keep snippets short enough for a card (about 50 characters per line in single-width cards) and write handlers as named functions with inferred input types. The story in `components/home/production-story.tsx` is Hussein Kizza's own wording, lightly edited for grammar; keep its flow. The portrait is the supplied `docs/public/me-plain.jpg` (540×677, already the 4:5 frame ratio). Community and package destinations are in `components/home/ecosystem.tsx`.

## Motion, layout and search

- Motion: `components/home/motion.tsx` adds `.nile-motion` after hydration and reveals `[data-reveal]` elements as they scroll into view (`components/home/motion.css`). Content stays visible without JavaScript and for visitors who prefer reduced motion. The hero animates on load with CSS, and in-page links scroll smoothly on the homepage only, so route changes never animate the scroll position.
- Corners: cards and panels are rounded; anything nested inside one uses `--nile-inner-radius` (3px).
- Spacing: `--nile-section-gap` and `--nile-heading-gap` in `components/home/base.css` set the vertical rhythm for every section and scale with the viewport. Change them there rather than per section.
- Layout: sections, the hero, cards, code panels, the benchmark and the file tree are size containers. Component layout uses `@container` queries; viewport media queries only set page gutters and section spacing. Card code sizes itself to its panel with `cqi` units.
- Global CSS in `app/app.css` applies balanced text wrapping and the custom scrollbars to the homepage and docs.
- Search: route `meta` exports own titles, canonical links, Open Graph and Twitter tags; the homepage also emits JSON-LD. `scripts/sitemap.ts` writes `sitemap.xml` from the pre-rendered guides during `finalize-build`, skipping redirect-only pages. Canonical guide URLs end in a slash, which only the guide's `index.html` answers, and legacy `.html` bookmarks redirect there. The build generates `robots.txt` pointing at the sitemap. Crawlers read robots.txt only at a domain root, so under the GitHub Pages base path submit the sitemap in Google Search Console too.
- Credits and ecosystem: `components/home/credits.tsx` thanks the projects Nile Js builds on (logos from svgl.app in `docs/public/images/credits/`) and links to `CONTRIBUTING.md`. `components/home/ecosystem.tsx` lists the community, tools and the creator's related libraries (slang-ts, @nilejs/future, @z-fetch/fetch, @craxjs/crax).
- Load speed: the hero is served as AVIF with a WebP fallback, the video is a click-to-play poster that loads YouTube's player only on demand, and the search dialog and its index load lazily after the page is interactive.
