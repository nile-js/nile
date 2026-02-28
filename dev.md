# Development Guide

Nile is a bun workspaces monorepo. All packages live under `packages/`.

## Prerequisites

- [Bun](https://bun.sh) (v1.x+)
- Node 20+ (for some tooling compatibility)

## Setup

From root, install all dependencies across every package:

```bash
bun install
```

Bun resolves `workspace:*` links automatically - no manual linking needed.

## Packages

| Package | Path | Published | Build |
| --- | --- | --- | --- |
| `@nilejs/nile` | `packages/nile` | Yes | `tsup` |
| `@nilejs/client` | `packages/client` | Yes | `tsup` |
| `@nilejs/cli` | `packages/cli` | Yes | `bun` (custom script) |
| docs site | `packages/web` | No (private) | `rspress` |
| example app | `packages/example` | No (private) | N/A (runs directly) |

## Building Packages

Each package is built independently from its own directory.

### Core Framework (`@nilejs/nile`)

```bash
bun run --cwd packages/nile build
```

Outputs CJS + ESM bundles via tsup. Entry point is `index.ts`.

Full export pipeline (lint, format, test, build):

```bash
bun run --cwd packages/nile export
```

### Client (`@nilejs/client`)

```bash
bun run --cwd packages/client build
```

Zero runtime dependencies. Outputs CJS + ESM + DTS via tsup.

Watch mode for development:

```bash
bun run --cwd packages/client dev
```

### CLI (`@nilejs/cli`)

```bash
bun run --cwd packages/cli build
```

Uses a custom build script (`scripts/build.ts`) that bundles with bun into `dist/index.js`.

Run locally without building:

```bash
bun run --cwd packages/cli dev
```

### Docs Site (`packages/web`)

```bash
bun run --cwd packages/web build
```

Builds the RSPress documentation site. Preview after building:

```bash
bun run --cwd packages/web preview
```

Dev server with hot reload:

```bash
bun run --cwd packages/web dev
```

### Example App (`packages/example`)

No build step - runs directly with bun:

```bash
bun run --cwd packages/example dev
```

Requires a running database. See `packages/example/README.md` for DB setup.

## Testing

Tests exist in the core package (`@nilejs/nile`) using vitest:

```bash
bun run --cwd packages/nile test        # watch mode
bun run --cwd packages/nile test:run    # single run
```

## Linting

The core package uses ultracite (biome-based):

```bash
bun run --cwd packages/nile check       # check only
bun run --cwd packages/nile fix         # auto-fix
```

The docs site uses biome directly:

```bash
bun run --cwd packages/web check
bun run --cwd packages/web format
```

## Workspace Dependencies

- `packages/example` depends on `@nilejs/nile` via `workspace:*`
- All other packages are independent of each other
- The CLI generates types (`ServicePayloads`) that the client consumes as a generic

## Notes

- All packages use `"type": "module"` (ESM-first)
- `bun install` at root handles everything - don't run install inside individual packages
- The root `package.json` is a workspace root only (no publishable code)
- Husky is configured at root for git hooks
