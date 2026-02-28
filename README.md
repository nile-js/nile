# Nile

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

TypeScript-first, service and actions oriented backend framework for building modern, fast, safe and AI-ready backends.

You define actions, group them into services, and get a predictable API with validation, error handling, and schema export — no route definitions, no controllers, no middleware chains, just your business logic.

[Full Documentation](https://nile-js.github.io/nile)

## Quick Start

```bash
npx @nilejs/cli new my-app
cd my-app && bun install && bun run dev
```

## Packages

| Package | Version | Description |
|---------|---------|-------------|
| [`@nilejs/nile`](./packages/nile) | [![npm](https://img.shields.io/npm/v/@nilejs/nile.svg)](https://www.npmjs.com/package/@nilejs/nile) | Core framework — server, engine, REST transport, logging, CORS, and utilities |
| [`@nilejs/cli`](./packages/cli) | [![npm](https://img.shields.io/npm/v/@nilejs/cli.svg)](https://www.npmjs.com/package/@nilejs/cli) | Project scaffolding and code generation |
| [`@nilejs/client`](./packages/client) | [![npm](https://img.shields.io/npm/v/@nilejs/client.svg)](https://www.npmjs.com/package/@nilejs/client) | Standalone, zero-dependency, type-safe frontend client |

### Other packages

| Package | Description |
|---------|-------------|
| [`example`](./packages/example) | Reference project showing a working Nile setup |
| [`web`](./packages/web) | Documentation site ([nile-js.github.io/nile](https://nile-js.github.io/nile)) |

## Repository Structure

```
nile/
  packages/
    nile/        Core framework (@nilejs/nile)
    cli/         CLI tool (@nilejs/cli)
    client/      Frontend client (@nilejs/client)
    example/     Reference project
    web/         Documentation site
```

## Development

This is a bun workspaces monorepo. See [dev.md](./dev.md) for the full development guide.

```bash
# Install all dependencies
bun install

# Build the core framework
bun run --cwd packages/nile build

# Run core tests
bun run --cwd packages/nile test:run

# Build the docs
bun run --cwd packages/web build
```

## Contributing

Contributions are welcome.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -m 'Add your feature'`)
4. Push to the branch (`git push origin feature/your-feature`)
5. Open a Pull Request

## License

MIT
