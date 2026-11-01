# Nile example

A runnable Tasks backend using Nile, Bun native HTTP, Drizzle and an embedded PGlite database. It follows the same layout as the CLI starter.

## Run

From this package, install dependencies and start the app:

```sh
bun install
bun run typecheck
bun run dev
```

The app creates its task table on first boot and listens at `http://localhost:8000`. PGlite stores this example’s data in `data/`. The database closes when the app shuts down.

## Follow an action

```text
src/
  index.ts
  db/
    client.ts
    schema.ts
    models/tasks.ts
  services/
    services.config.ts
    tasks/
      index.ts
      actions/
        create.ts
        list.ts
        get.ts
        update.ts
        delete.ts
```

`tasks/index.ts` registers the domain’s public actions. `services.config.ts` registers the service. Each action validates input, calls the model and returns a Result. Startup checks this layout before accepting actions.

```sh
curl -X POST http://localhost:8000/api/services \
  -H "Content-Type: application/json" \
  -d '{"intent":"execute","service":"tasks","action":"create","payload":{"title":"Ship it"}}'
```

Responses contain exactly `status`, `message` and `data`. The default success message is `Action completed.` Validation failures include a readable message, `data.errorCode` and `data.issues`.

Use `bun run gen service <name>` or `bun run gen action <service> <name>` to extend the app. See the [getting started guide](https://nile-js.github.io/nile/guide/start/getting-started/) for the complete workflow.
