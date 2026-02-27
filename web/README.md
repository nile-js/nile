# Nile Documentation Site

The official documentation site for [Nile](https://github.com/nile-js/nile), built with [Rspress](https://rspress.dev).

Live at [nile-js.github.io/nile](https://nile-js.github.io/nile)

## Setup

```bash
bun install
```

## Development

```bash
bun run dev
```

The site will be available at `http://localhost:3000`

## Building

```bash
bun run build
```

Preview the production build:

```bash
bun run preview
```

## Documentation Structure

```
docs/
  index.tsx                     # Home page (custom React component)
  home.css                      # Home page styles
  _nav.json                     # Top navigation
  guide/
    _meta.json
    start/
      getting-started.md
    basics/
      actions.md
      services.md
      context.md
      interacting.md
    internals/
      server.md
      engine.md
      rest.md
      cors.md
      logging.md
      db/
        index.md
        create-model.md
    others/
      architecture.md
      roadmap.md
```

## Theming

Blue brand colors are defined in `theme/index.css`:

```css
:root {
  --rp-c-brand: #3b82f6;
  --rp-c-brand-light: #60a5fa;
  --rp-c-brand-dark: #2563eb;
}
```

## LLMs Integration

The site uses `@rspress/plugin-llms` to generate `llms.txt` and `llms-full.txt` files at build time. These are copied to `docs/public/` via the `postbuild` script so they're accessible at the site root.

## Customization

- **Navigation**: `docs/_nav.json`
- **Sidebar**: `_meta.json` files in each directory
- **Home page**: `docs/index.tsx` and `docs/home.css`
- **Theme**: `theme/index.css`
- **Site config**: `rspress.config.ts`

## Adding Documentation

1. Create a `.md` file in the appropriate directory under `docs/guide/`
2. Update the corresponding `_meta.json` to include the new page in the sidebar
3. Test locally with `bun run dev`

## Deployment

Deploys to GitHub Pages automatically when changes are pushed to `main` via GitHub Actions (see `.github/`).
