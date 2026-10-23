# @nilejs/cli

[![NPM Version](https://img.shields.io/npm/v/@nilejs/cli.svg)](https://www.npmjs.com/package/@nilejs/cli)

Create [Nile Js](https://nile-js.github.io/nile/) projects and generate services, actions and schemas.

## Create a project

```bash
bunx @nilejs/cli new my-app
cd my-app
bun install
cp .env.example .env
bun run dev
```

The server starts on `http://localhost:8000`. The starter stores its data in an embedded PGlite database, so there is no database server to install. The [getting started guide](https://nile-js.github.io/nile/guide/start/getting-started/) walks through the starter step by step.

The starter includes:

- `src/index.ts`: server entry point on Bun's native HTTP server, with a logger and an `onBoot` schema push
- `src/db/`: PGlite and Drizzle client, the `tasks` table and a `taskModel` built with `createModel`
- `src/services/`: a `tasks` service with create, list, get, update and delete actions
- `Dockerfile`, `docker-compose.yml` and `docker-compose.dev.yml` for container deployments
- `drizzle.config.ts`, `.env.example`, `tsconfig.json` and `package.json`

## Generate code

Run the generators from the project root. The starter's `gen` script calls the CLI for you.

| Command | Description |
|---|---|
| `bun run gen service <name>` | Add a service with a sample action |
| `bun run gen action <service> <name>` | Add an action to an existing service |
| `bun run gen action <service> <name> --folder` | Add an action in its own folder, for private helper modules |
| `bun run gen schema` | Generate Zod schemas and TypeScript types from your actions |

`generate` also has the alias `gen`, so `bunx @nilejs/cli gen service users` works outside the starter.

### Services

```bash
bun run gen service users
```

Creates:

```text
src/services/users/
  actions/sample.ts   Sample action with a schema, an input type and a named handler
  index.ts            Exports the sample action
```

The CLI then asks whether to register the service in `src/services/services.config.ts`. If you decline, it prints the lines to add yourself.

### Actions

```bash
bun run gen action users get-user
```

Creates `src/services/users/actions/get-user.ts`:

```ts
import { createAction } from "@nilejs/nile";
import { Ok } from "slang-ts";
import z from "zod";

const getUserSchema = z.object({
  // Describe the input this action accepts
});

type GetUserInput = z.infer<typeof getUserSchema>;

const getUserHandler = async (input: GetUserInput) => {
  // Implement users.get-user here
  return Ok({ result: input });
};

export const getUserAction = createAction<GetUserInput>({
  name: "get-user",
  description: "GetUser action for users",
  validation: getUserSchema,
  handler: getUserHandler,
});
```

Kebab-case names become camelCase variables and PascalCase types. Register the action by importing it in `src/services/services.config.ts` and adding it to the service's `actions` list.

### Schemas and types

```bash
bun run gen schema
```

Reads every action's validation schema from `src/services/services.config.ts` and writes:

- `src/generated/schemas.ts`: named Zod schemas, such as `tasksCreateSchema`
- `src/generated/types.ts`: inferred types, such as `TasksCreatePayload`

| Flag | Description |
|---|---|
| `-e, --entry <path>` | Path to the services config (detected by default) |
| `-o, --output <path>` | Output directory (default: `src/generated`) |

Actions without a validation schema are skipped and listed in the output. Share the generated files with a frontend to validate forms with the same rules as the server.

## Requirements

- [Bun](https://bun.sh) 1.4.2 or later. The starter runs on Bun, and `gen schema` imports your services with Bun.

## License

MIT
