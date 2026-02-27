# Dialogue Documentation Site

This is the official documentation site for Dialogue, built with [rsPress](https://rspress.dev).

## Features

- Comprehensive documentation for Dialogue
- Custom green theme matching Dialogue branding
- Custom React home page with hero section and features
- Built-in search functionality
- Mobile-responsive design
- Automated deployment to GitHub Pages

## Setup

Install the dependencies:

```bash
bun install
```

## Development

Start the dev server:

```bash
bun run dev
```

The site will be available at `http://localhost:3000`

## Building

Build the website for production:

```bash
bun run build
```

Preview the production build locally:

```bash
bun run preview
```

## Documentation Structure

```
docs/
├── index.tsx              # Custom home page
├── home.css               # Home page styles
├── _nav.json              # Top navigation configuration
├── guide/                 # User guides
│   ├── _meta.json
│   ├── getting-started.md
│   ├── configuration.md
│   └── architecture.md
├── api/                   # API references
│   ├── _meta.json
│   ├── backend-api.md
│   └── client-api.md
├── examples/              # Examples and tutorials
│   ├── _meta.json
│   └── index.md
└── roadmap.md             # Product roadmap
```

## Theming

The green theme is applied via CSS variables in `theme/index.css`:

```css
:root {
  --rp-c-brand: #22c55e;
  --rp-c-brand-light: #4ade80;
  --rp-c-brand-dark: #16a34a;
}
```

## Deployment

The site automatically deploys to GitHub Pages when changes are pushed to the `main` branch via GitHub Actions.

### Manual Deployment Steps

1. Ensure repository Settings → Pages → Source is set to "GitHub Actions"
2. Push changes to the `main` branch
3. GitHub Actions will automatically build and deploy the site

## Adding New Documentation

1. Create a new `.md` file in the appropriate directory (`guide/`, `api/`, or `examples/`)
2. Add frontmatter to the file:
   ```yaml
   ---
   title: Your Page Title
   description: Brief description for SEO
   ---
   ```
3. Update the corresponding `_meta.json` file to include the new page in the sidebar
4. Test locally with `bun run dev`
5. Commit and push to trigger deployment

## Customization

- **Navigation**: Edit `docs/_nav.json` to modify the top navigation
- **Sidebar**: Edit `_meta.json` files in each directory to customize the sidebar
- **Home Page**: Edit `docs/index.tsx` and `docs/home.css`
- **Theme Colors**: Edit `theme/index.css`
- **Config**: Edit `rspress.config.ts` for site-wide settings

## Learn More

- [rsPress Documentation](https://rspress.dev)
- [Dialogue GitHub Repository](https://github.com/Hussseinkizz/dialogue)
