# @nilejs/nile

[![NPM Version](https://img.shields.io/npm/v/@nilejs/nile.svg)](https://www.npmjs.com/package/@nilejs/nile)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

The core framework package for Nile, a TypeScript-first, service and actions oriented backend framework.

## Install

```bash
bun add @nilejs/nile zod slang-ts
```

If using the database layer (`createModel`, `getZodSchema`):

```bash
bun add drizzle-orm drizzle-zod
```

## What's in this package

This package provides the server runtime, engine, and all core utilities:

- **`createNileServer`** - Server factory that wires up services, hooks, and REST transport
- **`createService` / `createServices`** - Service definition factories
- **`createAction` / `createActions`** - Action definition factories with Zod validation
- **`createModel`** - Type-safe CRUD model factory for Drizzle tables
- **`getContext`** - Access the shared NileContext (dependency injection, resources, sessions)
- **Engine** - Pipeline execution with before/after hooks, validation, and Result-based flow
- **REST layer** - Single-endpoint `POST /services` transport built on Hono
- **CORS** - Configurable origin control with per-route rules
- **Logging** - Structured log persistence with chunking support
- **Error handling** - `handleError` utility with Result pattern enforcement

## Quick example

```typescript
import { createNileServer, createAction } from "@nilejs/nile";
import { Ok } from "slang-ts";
import z from "zod";

const greet = createAction({
  name: "greet",
  description: "Say hello",
  validation: z.object({ name: z.string() }),
  handler: (data) => Ok({ message: `Hello, ${data.name}!` }),
});

const server = createNileServer({
  serverName: "my-app",
  services: [{ name: "hello", description: "Greeting service", actions: [greet] }],
  rest: { baseUrl: "/api", port: 8000 },
});

if (server.rest) {
  Bun.serve({ fetch: server.rest.app.fetch, port: 8000 });
}
```

## Project structure

```
packages/nile/
  index.ts          # Public API exports
  engine/           # Service registry, action pipeline, hook execution
  nile/             # Server factory, context management
  rest/             # Hono-based REST transport, intent handlers, middleware
  cors/             # CORS configuration and resolution
  logging/          # Structured log creation and retrieval
  utils/            # Error handling, diagnostics, DB model utilities
```

## Development

```bash
# Run tests
bun run test:run

# Build
bun run build

# Lint and format
bun run check && bun run fix
```

## Related packages

- [`@nilejs/cli`](https://www.npmjs.com/package/@nilejs/cli) - Project scaffolding and code generation
- [`@nilejs/client`](https://www.npmjs.com/package/@nilejs/client) - Type-safe frontend client

## License

MIT
