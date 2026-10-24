# Nile Js

[![npm version](https://img.shields.io/npm/v/@nilejs/nile.svg?label=@nilejs%2Fnile)](https://www.npmjs.com/package/@nilejs/nile)
[![npm downloads](https://img.shields.io/npm/dm/@nilejs/nile.svg)](https://www.npmjs.com/package/@nilejs/nile)
[![GitHub repo](https://img.shields.io/badge/GitHub-nile--js%2Fnile-blue?logo=github)](https://github.com/nile-js/nile)
[![GitHub stars](https://img.shields.io/github/stars/nile-js/nile.svg?style=social&label=Star)](https://github.com/nile-js/nile)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

TypeScript-first, service and actions oriented backend framework.

**Repository:** https://github.com/nile-js/nile (archived original: https://github.com/nile-squad/nile)

You define actions, group them into services, and get a predictable API with validation, error handling and schema export. No route definitions, controllers or middleware chains: each business operation lives in one place your team remembers and can reason about.

Built for small teams and coding agents that iterate fast. Services follow your business domains, so the structure scales predictably. Errors are values, input is validated before the handler runs, and dependencies come from one shared context. OpenTelemetry, background jobs and global hooks are built in, so Nile keeps you shipping as your backend grows.

[Documentation](https://nile-js.github.io/nile/) · [Getting started](https://nile-js.github.io/nile/guide/start/getting-started/) · [Features](https://nile-js.github.io/nile/guide/features/) · [Examples](https://nile-js.github.io/nile/guide/examples/)

> Nile Js is the result of 12 months of design and development. This repository is a ground-up rewrite; the original codebase lives at [nile-squad/nile](https://github.com/nile-squad/nile) (archived).

## Quick start

```bash
bunx @nilejs/cli new my-app
cd my-app
bun install
bun run dev
```

The server starts on `http://localhost:8000` with an embedded database, so there is nothing else to install.

## One action

```ts
import { createAction } from "@nilejs/nile";
import { Ok } from "@nilejs/nile/fp";
import { z } from "zod";

const createProjectSchema = z.object({
  name: z.string().trim().min(1),
});

type CreateProjectInput = z.infer<typeof createProjectSchema>;

const createProjectHandler = (input: CreateProjectInput) => {
  return Ok({ project: { id: crypto.randomUUID(), name: input.name } });
};

export const createProject = createAction<CreateProjectInput>({
  name: "create",
  description: "Create a project",
  validation: createProjectSchema,
  handler: createProjectHandler,
});
```

Register it in a service, then call it from any frontend:

```ts
const result = await nile.invoke({
  service: "projects",
  action: "create",
  payload: { name: "Customer portal" },
});

if (result.isErr) {
  console.error(result.error);
} else {
  console.log(result.value);
}
```

## Packages

| Package | Version | Description |
|---------|---------|-------------|
| [`@nilejs/nile`](./packages/nile) | [![npm](https://img.shields.io/npm/v/@nilejs/nile.svg)](https://www.npmjs.com/package/@nilejs/nile) | Core framework: server, engine, HTTP and WebSocket transports, validation, logging and utilities |
| [`@nilejs/cli`](./packages/cli) | [![npm](https://img.shields.io/npm/v/@nilejs/cli.svg)](https://www.npmjs.com/package/@nilejs/cli) | Project scaffolding and code generation |
| [`@nilejs/client`](./packages/client) | [![npm](https://img.shields.io/npm/v/@nilejs/client.svg)](https://www.npmjs.com/package/@nilejs/client) | Type-safe frontend client with a Result API and a socket client |

### Other packages

| Package | Description |
|---------|-------------|
| [`example`](./packages/example) | Reference project showing a working Nile Js setup |
| [`web`](./packages/web) | Website and documentation |
| [`benchmarks`](./packages/benchmarks) | Reproducible framework comparison suite |

## Repository structure

```
nile/
  packages/
    nile/        Core framework (@nilejs/nile)
    cli/         CLI tool (@nilejs/cli)
    client/      Frontend client (@nilejs/client)
    example/     Reference project
    web/         Website and documentation
    benchmarks/  Performance comparison suite
```

## Development

This is a Bun workspaces monorepo. [CONTRIBUTING.md](./CONTRIBUTING.md) covers setup, builds, tests and code standards.

```bash
# Install all dependencies
bun install

# Build and test the core framework
bun run --cwd packages/nile build
bun run --cwd packages/nile test:run

# Build the website and documentation
bun run --cwd packages/web build
```

## Community

Join the [WhatsApp community](https://chat.whatsapp.com/K0xkSiilbVtFf3QZoA1z5Z?mode=gi_t) to ask questions and share what you are building. Report bugs and propose features in [GitHub issues](https://github.com/nile-js/nile/issues).

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](./CONTRIBUTING.md), then:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes
4. Push the branch and open a pull request

## License

MIT
