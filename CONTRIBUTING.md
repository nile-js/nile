# Contributing to Nile Js

Thank you for helping improve Nile Js. This guide covers how the repository is set up, how to build and test each package, and what we look for in a pull request.

## Table of Contents

1. [Code of Conduct](#1-code-of-conduct)
2. [Prerequisites](#2-prerequisites)
3. [Setup](#3-setup)
4. [Repository Structure](#4-repository-structure)
5. [Building Packages](#5-building-packages)
6. [Testing](#6-testing)
7. [Linting and Formatting](#7-linting-and-formatting)
8. [Code Standards](#8-code-standards)
9. [Documentation Standards](#9-documentation-standards)
10. [Contribution Workflow](#10-contribution-workflow)
11. [Pull Request Guidelines](#11-pull-request-guidelines)
12. [Reporting Issues](#12-reporting-issues)

---

## 1. Code of Conduct

Participation in this project is governed by the [Code of Conduct](./CODE_OF_CONDUCT.md). All contributors are expected to uphold it.

---

## 2. Prerequisites

- [Bun](https://bun.sh) 1.4.2 or later
- Node.js 22.23.4+, 24.22.1+ or 26.12.1+ for the core package build (tsdown does not support Node.js 23 or 25)
- Git

---

## 3. Setup

Fork the repository, clone your fork, then install all workspace dependencies from the root:

```bash
git clone https://github.com/<your-username>/nile.git
cd nile
bun install
```

Bun resolves `workspace:*` links automatically. Do not run `bun install` inside individual packages.

---

## 4. Repository Structure

```
nile/
  packages/
    nile/       Core framework (@nilejs/nile)
    cli/        CLI tool (@nilejs/cli)
    client/     Frontend client (@nilejs/client)
    example/    Reference project
    web/        Website and documentation
    benchmarks/ Framework comparison suite
```

| Package | Path | Published |
|---------|------|-----------|
| `@nilejs/nile` | `packages/nile` | Yes |
| `@nilejs/client` | `packages/client` | Yes |
| `@nilejs/cli` | `packages/cli` | Yes |
| website and docs | `packages/web` | No |
| example app | `packages/example` | No |
| benchmarks | `packages/benchmarks` | No |

- `packages/example` depends on `@nilejs/nile` via `workspace:*`.
- The CLI generates payload types that `@nilejs/client` accepts as a generic. Otherwise the packages are independent.
- All packages are ESM (`"type": "module"`).
- Husky runs the pre-commit hook configured at the root.
- The root `package.json` is a workspace root only and contains no publishable code.

---

## 5. Building Packages

Build each package independently from its own directory.

### Core framework (`@nilejs/nile`)

```bash
bun run --cwd packages/nile build
```

The build uses tsdown with the TypeScript 7 declaration generator and writes ESM and CommonJS bundles, source maps and bundled declarations to `dist/`.

Full export pipeline (lint, format, test, build):

```bash
bun run --cwd packages/nile export
```

### Client (`@nilejs/client`)

```bash
bun run --cwd packages/client build
```

Watch mode for development:

```bash
bun run --cwd packages/client dev
```

Full export pipeline (type check, test, build):

```bash
bun run --cwd packages/client export
```

### CLI (`@nilejs/cli`)

```bash
bun run --cwd packages/cli build
```

Run locally without building:

```bash
bun run --cwd packages/cli dev
```

Full export pipeline (type check, build, then run the built CLI):

```bash
bun run --cwd packages/cli export
```

### Publishing

Run each package's `export` before `npm publish`, and publish in this order: `@nilejs/nile`, then `@nilejs/client`, then `@nilejs/cli`. The CLI starter installs `@nilejs/nile@latest`, so the framework release must be on npm first.

### Website and docs (`packages/web`)

The site is a React Router app with Fumadocs. Guides live in `packages/web/docs/guide/`.

```bash
bun run --cwd packages/web dev       # dev server with hot reload
bun run --cwd packages/web build     # check docs, pre-render and finalize the static site
bun run --cwd packages/web preview   # serve the built site locally
```

The build reads `VITE_SITE_URL` and `VITE_BASE_PATH` to decide where the site is hosted. See `packages/web/README.md`.

### Example app (`packages/example`)

No build step. Runs directly:

```bash
bun run --cwd packages/example dev
```

It uses an embedded PGlite database, so no database server is needed. See `packages/example/README.md`.

---

## 6. Testing

The core framework and the client have Vitest suites:

```bash
bun run --cwd packages/nile test        # watch mode
bun run --cwd packages/nile test:run    # single run
bun run --cwd packages/client test:run
```

The website checks every guide page for broken links and frontmatter:

```bash
bun run --cwd packages/web docs:check
```

- Write all assertions inside `it()` or `test()` blocks.
- Use `async/await` instead of done callbacks in async tests.
- Do not commit `.only` or `.skip` modifiers.
- Do not change a test just to make it pass, and do not change the implementation just to fit a test. When they disagree, find out which one reflects the intended behavior first. If you are unsure, ask in an issue.

---

## 7. Linting and Formatting

The project uses [Ultracite](https://github.com/haydenbleasel/ultracite), a zero-config preset built on Biome, for linting and formatting.

### Core package

```bash
bun run --cwd packages/nile check    # check only
bun run --cwd packages/nile fix      # auto-fix
```

Or using Ultracite directly:

```bash
bun x ultracite check
bun x ultracite fix
```

### Website and docs

```bash
bun run --cwd packages/web lint
bun run --cwd packages/web types:check
bun run --cwd packages/web format
```

Run `bun x ultracite fix` before pushing any changes to ensure code is compliant. Most formatting issues are fixed automatically.

---

## 8. Code Standards

The following conventions apply to all TypeScript and JavaScript files in this repository.

### 8.1 General Principles

- No classes, no OOP patterns. Use functions, factory functions and functional composition instead.
- Maximum 400 lines of code per file. Extract into separate files when approaching this limit.
- One function, one responsibility unless inevitable.
- Pass dependencies as parameters, not as hard imports (dependency injection).
- Use named parameters through an options object, not positional parameters.
- Use early returns and guard clauses. Avoid nested conditionals.
- Code should be readable without needing comments to explain what it does.

### 8.2 Naming

| Target | Convention | Example |
|--------|-----------|---------|
| Functions | `verbNoun` | `createUser`, `getSession` |
| Boolean variables | `isX`, `hasX` | `isActive`, `hasPermission` |
| Constants | `UPPER_SNAKE_CASE` | `MAX_RETRIES` |
| File names | `kebab-case.ts` | `create-user.ts` |
| Domain directories | singular noun | `auth/`, `tasks/` |

### 8.3 TypeScript

- Use explicit types for function parameters and return values where they add clarity.
- Prefer `unknown` over `any` when the type is genuinely unknown.
- Use `const` by default, `let` only when reassignment is needed, never `var`.
- Use optional chaining (`?.`) and nullish coalescing (`??`) for safer property access.
- Use `const` assertions (`as const`) for immutable values and literal types.
- Use TypeScript's type narrowing instead of type assertions.

### 8.4 Error Handling

All operations that can fail must use the `safeTry` pattern from Slang Ts instead of raw `try/catch` blocks.

- Action handlers must return a `Result` type using `Ok` / `Err` from `@nilejs/nile/fp` (Nile's re-export of slang-ts).
- Throw immediately for critical configuration errors (missing dependencies, invalid startup state).
- Handle anticipated runtime errors (user input, external services) gracefully, returning `Err` rather than throwing.
- Remove all `console.log`, `debugger`, and `alert` statements before submitting.
- Throw `Error` objects with descriptive messages, not plain strings.

### 8.5 Module Organization

Group files by domain. Each domain directory contains focused single-responsibility files. In a Nile Js project, each service keeps one action per file:

```
services/
  services.config.ts   # registers every service and its actions
  tasks/
    actions/
      create.ts        # exports createTaskAction
      list.ts          # exports listTaskAction
  users/
    actions/
      get-user.ts      # exports getUserAction
```

JSDoc is required for all public API functions. Comments should explain intent (why), not restate what the code does.

### 8.6 Async

- Always `await` promises in async functions.
- Use `async/await` rather than promise chains.
- Do not use async functions as Promise executors.

---

## 9. Documentation Standards

Documentation in this repository follows these rules:

- Document only verified, implemented behavior. Do not document planned features without the label "Planned (Not Implemented)".
- Technical accuracy takes priority over completeness. If uncertain about behavior, verify in the source before writing.
- Use neutral, technical language. Avoid promotional phrasing, superlatives, and urgency-driven wording.
- No emojis, no slang, no marketing-style adjectives in formal documents.
- Do not use em-dash characters. Use commas or periods instead.
- Prefer structured bullets and short paragraphs over long prose.
- Every changed behavior requires an immediate documentation update. Stale documentation must be removed or corrected.

Code examples in the guides use a named Zod schema, a type inferred from it and a named handler passed to `createAction`. When adding internal documentation, follow the format used in `packages/web/docs/guide/internals/`.

---

## 10. Contribution Workflow

1. **Fork** the repository and create a feature branch from `main`:

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make changes.** Keep commits small and focused. Each commit should represent a single logical change.

3. **Lint and test** before pushing:

   ```bash
   bun run --cwd packages/nile fix
   bun run --cwd packages/nile test:run
   ```

4. **Push** your branch and open a pull request against `main`.

### Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org), for example `fix(rest): reject JSON bodies for multipart actions`. The [better-commits](https://github.com/Everduin94/better-commits) CLI can help you write them.

Avoid vague messages like "fix stuff" or "update files".

---

## 11. Pull Request Guidelines

- Keep the PR focused on a single concern. Split unrelated changes into separate PRs.
- Provide a clear description of what changed and why.
- Link to any relevant issue using `Closes #<issue-number>` or `Refs #<issue-number>`.
- All existing tests must pass. New behavior should include tests.
- Do not add new dependencies or change core configuration files without prior discussion in an issue.
- Do not modify database-related code without explicit approval from the project maintainer.
- PRs that touch `packages/nile/` core internals (engine, REST, server, CORS) require extra review attention.

---

## 12. Reporting Issues

Use the GitHub issue tracker. Before opening a new issue, search existing issues to avoid duplicates.

### Bug reports

Include:
- A minimal reproduction case
- Expected behavior and actual behavior
- Runtime environment (OS, Bun/Node version, package version)
- Relevant error messages or stack traces

### Feature requests

Include:
- The problem the feature would solve
- A description of the proposed solution
- Any alternatives you considered

For significant changes that affect the public API, architecture, or add new dependencies, open a discussion issue first before submitting a pull request.
