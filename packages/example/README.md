# nile-example

A reference implementation showing how to build a backend with [Nile](https://github.com/nile-js/nile).

This example uses PGlite (embedded Postgres) with Drizzle ORM and includes a `tasks` service with full CRUD operations.

## Setup

```bash
bun install
cp .env.example .env   # if .env.example exists
```

## Database

Push the schema to PGlite:

```bash
bun run db:push
```

Other database commands:

```bash
bun run db:generate   # Generate Drizzle migrations
bun run db:studio     # Open Drizzle Studio
```

## Running

```bash
bun run dev
```

The server starts at `http://localhost:8000` with a single endpoint at `POST /api/services`.

## Project structure

```
src/
  index.ts              # Server entry point
  db/
    client.ts           # PGlite + Drizzle setup
    schema.ts           # Drizzle table definitions
    types.ts            # Inferred DB types
    models/
      tasks.ts          # Task model using createModel
  services/
    services.config.ts  # Service registry
    tasks/
      create.ts         # Create task action
      list.ts           # List tasks action
      get.ts            # Get task by ID action
      update.ts         # Update task action
      delete.ts         # Delete task action
```

## Try it

```bash
# Create a task
curl -X POST http://localhost:8000/api/services \
  -H "Content-Type: application/json" \
  -d '{"intent":"execute","service":"tasks","action":"create","payload":{"title":"Ship it"}}'

# List all tasks
curl -X POST http://localhost:8000/api/services \
  -H "Content-Type: application/json" \
  -d '{"intent":"execute","service":"tasks","action":"list","payload":{}}'

# Explore available services
curl -X POST http://localhost:8000/api/services \
  -H "Content-Type: application/json" \
  -d '{"intent":"explore","service":"*","action":"*","payload":{}}'
```
