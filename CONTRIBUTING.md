# Contributing to Nile

Thanks for your interest in contributing to Nile framework, its such a previledge that your here, we all trying to make world a better place.

So below are some of the guidelines on what you need to know to effectively contribute to Nile.

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

- [Bun](https://bun.sh) v1.x or later
- Node.js 20+ (required for some tooling compatibility)
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
    web/        Documentation site
```

| Package | Path | Published |
|---------|------|-----------|
| `@nilejs/nile` | `packages/nile` | Yes |
| `@nilejs/client` | `packages/client` | Yes |
| `@nilejs/cli` | `packages/cli` | Yes |
| docs site | `packages/web` | No |
| example app | `packages/example` | No |

- `packages/example` depends on `@nilejs/nile` via `workspace:*`.
- All other packages are independent of each other.
- The root `package.json` is a workspace root only and contains no publishable code.

---

## 5. Building Packages

Build each package independently from its own directory.

### Core framework (`@nilejs/nile`)

```bash
bun run --cwd packages/nile build
```

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

### CLI (`@nilejs/cli`)

```bash
bun run --cwd packages/cli build
```

Run locally without building:

```bash
bun run --cwd packages/cli dev
```

### Docs site (`packages/web`)

```bash
bun run --cwd packages/web build
```

Dev server with hot reload:

```bash
bun run --cwd packages/web dev
```

### Example app (`packages/example`)

No build step. Runs directly:

```bash
bun run --cwd packages/example dev
```

Requires a running database. See `packages/example/README.md` for setup instructions.

---

## 6. Testing

Tests are located in `packages/nile` and run with Vitest:

```bash
bun run --cwd packages/nile test        # watch mode
bun run --cwd packages/nile test:run    # single run
```

- Write all assertions inside `it()` or `test()` blocks.
- Use `async/await` instead of done callbacks in async tests.
- Do not commit `.only` or `.skip` modifiers.
- Tests must match the implementation. Do not adjust tests to force a pass; fix the implementation.
- Same aspect do not just change the implementation to fit the tests, its possible the implementation was intentional and the tests are outdated, broken or something, investigate before you change one or the other, open a discussion if not certain.

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

### Docs site

```bash
bun run --cwd packages/web check
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
- Use named parameters via an options or config or an object, not positional (see AGENTS.md)
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

- Action handlers must return a `Result` type using `Ok` / `Err` from `slang-ts`.
- Throw immediately for critical configuration errors (missing dependencies, invalid startup state).
- Handle anticipated runtime errors (user input, external services) gracefully, returning `Err` rather than throwing.
- Remove all `console.log`, `debugger`, and `alert` statements before submitting.
- Throw `Error` objects with descriptive messages, not plain strings.

### 8.5 Module Organization

Group files by domain. Each domain directory contains focused single-responsibility files and an optional `index.ts` barrel export:

```
services/
  auth/
    login.ts         # exports loginAction
    logout.ts        # exports logoutAction
    index.ts         # barrel exports
  tasks/
    create.ts
    list.ts
    index.ts
```

JSDoc is required for all public API functions. Comments should explain intent (why), not restate what the code does.

### 8.6 Async

- Always `await` promises in async functions.
- Use `async/await` rather than promise chains.
- Do not use async functions as Promise executors.

---

## 9. Documentation Standards

All documentation in this repository follows the standards in [`documentation-guidelines.md`](./documentation-guidelines.md). The key requirements are:

- Document only verified, implemented behavior. Do not document planned features without the label "Planned (Not Implemented)".
- Technical accuracy takes priority over completeness. If uncertain about behavior, verify in the source before writing.
- Use neutral, technical language. Avoid promotional phrasing, superlatives, and urgency-driven wording.
- No emojis, no slang, no marketing-style adjectives in formal documents.
- Do not use em-dash characters. Use commas or periods instead.
- Prefer structured bullets and short paragraphs over long prose.
- Every changed behavior requires an immediate documentation update. Stale documentation must be removed or corrected.

When adding new internal documentation, follow the format used in `packages/web/docs/guide/internals/`.

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

Use better-commits cli, install it via npm i -g better-commits

then run better-commits for making a commit, or just do as you see fit but follow conventional commits standard.

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
