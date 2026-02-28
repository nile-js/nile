# @nilejs/cli

[![NPM Version](https://img.shields.io/npm/v/@nilejs/cli.svg)](https://www.npmjs.com/package/@nilejs/cli)

CLI for scaffolding and generating [Nile](https://www.npmjs.com/package/@nilejs/nile) backend projects.

## Install

```bash
bun add -g @nilejs/cli
```

```bash
npm install -g @nilejs/cli
```

Or use without installing:

```bash
bunx @nilejs/cli new my-app
```

```bash
npx @nilejs/cli new my-app
```

## Commands

### `nile new <project-name>`

Scaffold a new Nile project. Copies the project template, replaces placeholders with your project name, and prints next steps.

```bash
nile new my-app
```

Output:

```
Creating project: my-app

  Copying project files...
  Configuring project...
  Project "my-app" created.

Next steps:

    cd my-app
    bun install
    cp .env.example .env
    bun run dev
```

The scaffolded project includes:

- `src/index.ts`, server entry with PGLite and Drizzle
- `src/db/`, database client, schema, types, and a `tasks` model using `createModel`
- `src/services/`, a `tasks` service with five CRUD actions
- `drizzle.config.ts`, `.env.example`, `tsconfig.json`, `package.json`

### `nile generate service <name>`

Alias: `nile g service <name>`

Generate a new service directory under `src/services/` with a demo action and barrel export. Run this from the project root.

```bash
nile g service users
```

Creates:

```
src/services/users/
  sample.ts       # Demo action with Zod schema, handler, and createAction
  index.ts        # Barrel export
```

After creating the files, the CLI asks whether to auto-register the service in `src/services/services.config.ts`. If you accept, it adds the import and service entry. If you decline, it prints the snippet to add manually.

### `nile generate action <service-name> <action-name>`

Alias: `nile g action <service-name> <action-name>`

Generate a new action file in an existing service directory.

```bash
nile g action users get-user
```

Creates `src/services/users/get-user.ts` with:

```typescript
import { type Action, createAction } from "@nilejs/nile";
import { Ok } from "slang-ts";
import z from "zod";

const getUserSchema = z.object({
  // Define your validation schema here
});

const getUserHandler = async (data: Record<string, unknown>) => {
  // Implement your users.get-user logic here
  return Ok({ result: data });
};

export const getUserAction: Action = createAction({
  name: "get-user",
  description: "GetUser action for users",
  handler: getUserHandler,
  validation: getUserSchema,
});
```

Kebab-case names are converted to camelCase for variables and PascalCase for types.

## Generated Project Structure

```
my-app/
  package.json
  tsconfig.json
  drizzle.config.ts
  .env.example
  src/
    index.ts
    db/
      client.ts
      schema.ts
      types.ts
      index.ts
      models/
        tasks.ts
        index.ts
    services/
      services.config.ts
      tasks/
        create.ts
        list.ts
        get.ts
        update.ts
        delete.ts
```

## Requirements

- Node.js 18+ or Bun
- The scaffolded project uses Bun as its runtime (`Bun.serve`, `bun run`)

## License

MIT
