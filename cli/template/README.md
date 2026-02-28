# {{projectName}}

Built with [Nile](https://www.npmjs.com/package/@nilejs/nile).

## Setup

```bash
bun install
cp .env.example .env
bun run dev
```

The server starts at `http://localhost:8000`. PGLite creates an embedded Postgres database automatically, no external database required.

## Scripts

| Script | Description |
|---|---|
| `bun run dev` | Start the development server |
| `bun run db:generate` | Generate Drizzle migrations from schema changes |
| `bun run db:push` | Push schema changes directly to the database |
| `bun run db:studio` | Open Drizzle Studio to browse your data |

## Project Structure

```
src/
  index.ts                        # Server entry point
  db/
    client.ts                     # PGLite + Drizzle client
    schema.ts                     # Drizzle table definitions
    types.ts                      # Inferred types from schema
    index.ts                      # Barrel export
    models/
      tasks.ts                    # Task model (createModel)
      index.ts                    # Barrel export
  services/
    services.config.ts            # Service registry
    tasks/
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

## Adding Services

Generate a new service with the CLI:

```bash
nile generate service users
# or: nile g service users
```

Or manually create a directory under `src/services/` with action files and register it in `src/services/services.config.ts`.

## Adding Actions

Generate a new action in an existing service:

```bash
nile generate action users get-user
# or: nile g action users get-user
```

Each action file exports a single action created with `createAction`, which takes a Zod validation schema and a handler function that returns `Ok(data)` or `Err(message)`.

## Generating Schemas & Types

Extract Zod validation schemas from your actions and generate TypeScript types:

```bash
nile generate schema
# or: nile g schema
```

This auto-detects `src/services/services.config.ts`, reads validation schemas from all actions, and outputs two files:

- `src/generated/schemas.ts` — named Zod schema exports
- `src/generated/types.ts` — inferred TypeScript types via `z.infer`

Options:

| Flag | Description |
|---|---|
| `-e, --entry <path>` | Path to services config (auto-detected by default) |
| `-o, --output <path>` | Output directory (default: `src/generated`) |

Actions without a validation schema are skipped and listed in the CLI output.

## Database

This project ships with [PGLite](https://electric-sql.com/product/pglite) for zero-setup local development. For production, you can swap it for Postgres, MySQL, SQLite, or any other database supported by Drizzle. Update `src/db/client.ts` with your connection and driver.

See the [Drizzle getting started guide](https://orm.drizzle.team/docs/get-started) for setup instructions with each supported database.

## Tech Stack

- **Runtime:** [Bun](https://bun.sh)
- **Framework:** [@nilejs/nile](https://www.npmjs.com/package/@nilejs/nile)
- **Database:** [PGLite](https://electric-sql.com/product/pglite) (embedded Postgres)
- **ORM:** [Drizzle](https://orm.drizzle.team)
- **Validation:** [Zod](https://zod.dev)
