# {{projectName}}

Built with [Nile Js](https://nile-js.github.io/nile/). Read the [getting started guide](https://nile-js.github.io/nile/guide/start/getting-started/) for a walkthrough of this starter.

The server runs on Bun's native HTTP server (`runtime: "bun", native: true` in `src/index.ts`). REST settings live under `rest`; custom routes and middleware are available on `server.nativeRest`.

## Setup

```bash
bun install
cp .env.example .env
bun run dev
```

The server starts at `http://localhost:8000`. PGlite creates an embedded Postgres database in `data/` on first start, so no database server is required. The first start can take up to 30 seconds.

## Scripts

| Script | Description |
|---|---|
| `bun run dev` | Start the development server |
| `bun run gen service <name>` | Generate a new service |
| `bun run gen action <service> <name>` | Generate a new action |
| `bun run gen schema` | Generate Zod schemas and TypeScript types |
| `bun run db:generate` | Generate Drizzle migrations from schema changes |
| `bun run db:push` | Push schema changes directly to the database |
| `bun run db:studio` | Open Drizzle Studio to browse your data |

## Project structure

```
src/
  index.ts                        # Server entry point
  db/
    client.ts                     # PGlite + Drizzle client
    schema.ts                     # Drizzle table definitions
    types.ts                      # Inferred types from schema
    index.ts                      # Barrel export
    models/
      tasks.ts                    # Task model (createModel)
      index.ts                    # Barrel export
  services/
    services.config.ts            # Service registry
    tasks/actions/
      create.ts                   # Create task action
      list.ts                     # List tasks action
      get.ts                      # Get task by ID action
      update.ts                   # Update task action
      delete.ts                   # Delete task action
```

## Usage

All requests go through a single POST endpoint. The `intent` field determines the operation.

### Explore available services

```bash
curl -X POST http://localhost:8000/api/services \
  -H "Content-Type: application/json" \
  -d '{"intent":"explore","service":"*","action":"*","payload":{}}'
```

### Execute an action

```bash
curl -X POST http://localhost:8000/api/services \
  -H "Content-Type: application/json" \
  -d '{"intent":"execute","service":"tasks","action":"create","payload":{"title":"My first task"}}'
```

### Get action schemas

```bash
curl -X POST http://localhost:8000/api/services \
  -H "Content-Type: application/json" \
  -d '{"intent":"schema","service":"tasks","action":"*","payload":{}}'
```

## Adding services

Generate a new service with the CLI:

```bash
bun run gen service users
```

The generator offers to register the service in `src/services/services.config.ts`. To add one by hand, create a folder under `src/services/` with an `actions/` folder and register its actions in `services.config.ts`.

## Adding actions

Generate a new action in an existing service:

```bash
bun run gen action users get-user
```

This creates `src/services/users/actions/get-user.ts`. Each action file exports one action created with `createAction`: a named Zod schema, an input type inferred from it and a named handler that returns `Ok(data)` or `Err(message)`. Import the action in `src/services/services.config.ts` and add it to the service's `actions` list.

## Generating schemas and types

Extract Zod validation schemas from your actions and generate TypeScript types:

```bash
bun run gen schema
```

This auto-detects `src/services/services.config.ts`, reads validation schemas from all actions, and outputs two files:

- `src/generated/schemas.ts`: named Zod schema exports
- `src/generated/types.ts`: inferred TypeScript types via `z.infer`

Options:

| Flag | Description |
|---|---|
| `-e, --entry <path>` | Path to services config (auto-detected by default) |
| `-o, --output <path>` | Output directory (default: `src/generated`) |

Actions without a validation schema are skipped and listed in the CLI output.

## Database

This project ships with [PGlite](https://electric-sql.com/product/pglite) for zero-setup local development. For production, you can swap it for Postgres, MySQL, SQLite, or any other database supported by Drizzle. Update `src/db/client.ts` with your connection and driver.

See the [Drizzle getting started guide](https://orm.drizzle.team/docs/get-started) for setup instructions with each supported database.

## Tech stack

- **Runtime:** [Bun](https://bun.sh)
- **Framework:** [Nile Js](https://nile-js.github.io/nile/) (`@nilejs/nile`)
- **Database:** [PGlite](https://electric-sql.com/product/pglite) (embedded Postgres)
- **ORM:** [Drizzle](https://orm.drizzle.team)
- **Validation:** [Zod](https://zod.dev)
