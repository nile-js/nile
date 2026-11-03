# {{projectName}}

Built with [Nile Js](https://nile-js.github.io/nile/). Read the [getting started guide](https://nile-js.github.io/nile/guide/start/getting-started/) for a walkthrough of this starter.

The server runs on Bun's native HTTP server (`runtime: "bun", native: true` in `src/index.ts`). REST settings live under `rest`; custom routes and middleware are available on `server.nativeRest`.

The included `SKILL.md` gives coding assistants the action pattern, service layout and current error-handling rules. After a Nile upgrade, use `node_modules/@nilejs/nile/SKILL.md` as the current reference.

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
    tasks/
      index.ts                    # Registers the tasks service
      actions/
        create.ts                   # Create task action
        list.ts                     # List tasks action
        get.ts                      # Get task by ID action
        update.ts                   # Update task action
        delete.ts                   # Delete task action
```

## Usage

HTTP action calls go through a single POST endpoint. The `intent` field determines the operation.

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

Responses have exactly `status`, `message` and `data`. The default success message is `Action completed.` Validation failures contain Zod’s readable message and `{ errorCode, issues }` in `data`. Unexpected failures use a generated diagnostic reference linked to the log’s `log_id`; internal `raw` causes are never sent to the frontend.

## Optional features

Keep business logic in actions and ordinary functions. Configure other features when the product needs them: [typed Socket.IO topics](https://nile-js.github.io/nile/guide/features/websockets/), [cron jobs](https://nile-js.github.io/nile/guide/features/cron-jobs/), [rate limits](https://nile-js.github.io/nile/guide/features/rate-limiting/), [queues](https://nile-js.github.io/nile/guide/features/queues-debounce-throttle/) and [telemetry](https://nile-js.github.io/nile/guide/features/telemetry/). On the frontend, `createNileClient` calls actions and sends and receives topics through `nile.socket`.

## Adding services

Generate a new service with the CLI:

```bash
bun run gen service users
```

The generator offers to register the service in `src/services/services.config.ts`. To add one by hand, create a folder under `src/services/` with an `actions/` folder and create an `index.ts` that registers its actions with `createService`. Import that service into `services.config.ts`. Nile checks this layout at startup and fails on violations by default. Set `project.structure` to `"warn"` explicitly if you need to migrate an older layout gradually.

## Adding actions

Generate a new action in an existing service:

```bash
bun run gen action users get-user
```

This creates `src/services/users/actions/get-user.ts`. Each action file exports one action created with `createAction`: a named Zod schema, an input type inferred from it and a named handler that returns `Ok(data)` or `Err(message)`. Import the action in `src/services/users/index.ts` and add it to the service's `actions` list.

## Generating schemas and types

Extract Zod validation schemas from your actions and generate TypeScript types:

```bash
bun run gen schema
```

This auto-detects `src/services/services.config.ts`, reads validation schemas from all actions, and outputs two files:

- `src/generated/schemas.ts`: named Zod schema exports
- `src/generated/types.ts`: input TypeScript types via `z.input`

Options:

| Flag | Description |
|---|---|
| `-e, --entry <path>` | Path to services config (auto-detected by default) |
| `-o, --output <path>` | Output directory (default: `src/generated`) |

Every registered action is included in `ServicePayloads`. Actions without validation accept an object payload (`Record<string, unknown>`); call `tasks.list` with `{}`. This fallback does not add server-side validation. Schemas that cannot be converted are reported separately.

## Database

This project ships with [PGlite](https://electric-sql.com/product/pglite) for zero-setup local development. For production, you can swap it for Postgres, MySQL, SQLite, or any other database supported by Drizzle. Update `src/db/client.ts` with your connection and driver.

See the [Drizzle getting started guide](https://orm.drizzle.team/docs/get-started) for setup instructions with each supported database.

## Tech stack

- **Runtime:** [Bun](https://bun.sh)
- **Framework:** [Nile Js](https://nile-js.github.io/nile/) (`@nilejs/nile`)
- **Database:** [PGlite](https://electric-sql.com/product/pglite) (embedded Postgres)
- **ORM:** [Drizzle](https://orm.drizzle.team)
- **Validation:** [Zod](https://zod.dev)
