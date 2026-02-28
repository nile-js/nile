# 🌊 Nile

[![NPM Version](https://img.shields.io/npm/v/@nilejs/nile.svg)](https://www.npmjs.com/package/@nilejs/nile)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Hono](https://img.shields.io/badge/Hono-E36002?logo=hono&logoColor=white)
![Zod](https://img.shields.io/badge/Zod-3E67B1?logo=zod&logoColor=white)
![Drizzle](https://img.shields.io/badge/Drizzle-C5F74F?logo=drizzle&logoColor=black)

TypeScript-first, service and actions oriented backend framework for building modern, fast, safe and AI-ready backends with simplest developer experience possible.

You define actions, group them into services, and get a predictable API with validation, error handling, and schema export, no route definitions, no controllers, no middleware chains and rest api conventions to care about, just your business logic. And it's all AI agent-ready out of the box, progressively discoverable and tool calling ready with validation.

## Install

> Or View Full Docs -> [nile-js.github.io/nile](https://nile-js.github.io/nile)

### Scaffold a project (recommended)

The fastest way to start is with the CLI. It creates a working project with services, database, and dev tooling pre-configured:

```bash
npx @nilejs/cli new my-app
```

```bash
cd my-app && bun install && bun run dev
```

The CLI also includes generators for adding services, actions, and extracting Zod schemas with TypeScript types. See [`@nilejs/cli`](./cli/README.md) for details.

### Manual install

```bash
bun add @nilejs/nile zod slang-ts
```

```bash
npm install @nilejs/nile zod slang-ts
```

If using the database layer (`createModel`, `getZodSchema`):

```bash
bun add drizzle-orm drizzle-zod
```

## Quick Start

### 1. Define an action

```typescript
// services/tasks/create.ts
import { Ok } from "slang-ts";
import z from "zod";
import { createAction, type Action } from "@nilejs/nile";

const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required"),
  status: z.enum(["pending", "in-progress", "done"]).default("pending"),
});

const createTaskHandler = (data: Record<string, unknown>) => {
  const task = {
    id: crypto.randomUUID(),
    title: data.title as string,
    status: (data.status as string) ?? "pending",
  };
  return Ok({ task });
};

export const createTaskAction: Action = createAction({
  name: "create",
  description: "Create a new task",
  validation: createTaskSchema,
  handler: createTaskHandler,
});
```

### 2. Group actions into a service

```typescript
// services/config.ts
import { type Services } from "@nilejs/nile";
import { createTaskAction } from "./tasks/create";
import { listTaskAction } from "./tasks/list";

export const services: Services = [
  {
    name: "tasks",
    description: "Task management",
    actions: [createTaskAction, listTaskAction],
  },
];
```

### 3. Start the server

```typescript
// server.ts
import { createNileServer } from "@nilejs/nile";
import { services } from "./services/config";

const server = createNileServer({
  serverName: "my-app",
  services,
  rest: {
    baseUrl: "/api",
    port: 8000,
  },
});

if (server.rest) {
  const { fetch } = server.rest.app;
  Bun.serve({ fetch, port: 8000 });
  console.log("Server running at http://localhost:8000");
}
```

### 4. Call it

```bash
curl -X POST http://localhost:8000/api/services \
  -H "Content-Type: application/json" \
  -d '{
    "intent": "execute",
    "service": "tasks",
    "action": "create",
    "payload": { "title": "Ship it", "status": "pending" }
  }'
```

```json
{
  "status": true,
  "message": "Action 'tasks.create' executed",
  "data": {
    "task": {
      "id": "a1b2c3d4-...",
      "title": "Ship it",
      "status": "pending"
    }
  }
}
```

## Why Nile

**You write business logic. Nile handles the rest.**

Most backend frameworks make you think about HTTP verbs, route trees, middleware ordering, and error serialization before you write a single line of domain logic. Nile removes that ceremony. You define actions, plain functions that take data and return results, and they become callable over a single POST endpoint or other protocols such as web sockets or rpc within your codebase.

**Nothing crashes silently.** Every action handler returns `Ok(data)` or `Err(message)` using the Result pattern from [Slang Ts](github.com/Hussseinkizz/slang) Functional programming utilities library. So no unhandled exceptions, no try-catch spaghetti, no mystery 500s. Your control flow is predictable by design and safe.

**AI agents can call your API without adapters.** Every action with a Zod validation schema automatically exports its parameters as JSON Schema. An LLM can discover your services, read the schemas, and make tool calls, no custom integration code required.

**Your database, your choice.** Nile doesn't own your data layer. When you want structured DB access, nile works with drizzle orm and any databases it supports, postgres, pglite or sqlite and more, but also provides utilities like `createModel` for simplifying type-safe CRUD operations for any Drizzle table with auto-validation, error handling, and pagination built in to reduce boilerplate. You can also use any other database library or raw queries in your action handlers, it's all up to you.

**There's more to Nile** than just the core server, you get service and action based architecture, powerful hook system, structured logging and enforced error handling, rate limiting, CORS control, uploads, single context for dependency injection or sharing, and more. And you don't need a Phd to understand how to use any of them.

## Core Concepts

Nile uses a single POST endpoint for everything. Instead of mapping HTTP verbs to routes, you send a JSON body with an **intent** that tells the server what you want to do.

Every request has the same shape:

```typescript
{
  intent: "explore" | "execute" | "schema",
  service: string,    // service name, or "*" for all
  action: string,     // action name, or "*" for all
  payload: object     // data for the action (use {} when not needed)
}
```

Every response has the same shape:

```typescript
{
  status: boolean,    // true = success, false = error
  message: string,    // human-readable description
  data: object        // result payload, or {} on error
}
```

### Explore, discover what's available

List all services:

```bash
curl -X POST http://localhost:8000/api/services \
  -H "Content-Type: application/json" \
  -d '{ "intent": "explore", "service": "*", "action": "*", "payload": {} }'
```

```json
{
  "status": true,
  "message": "Available services",
  "data": {
    "result": [
      {
        "name": "tasks",
        "description": "Task management",
        "actions": ["create", "list"]
      }
    ]
  }
}
```

Drill into a service to see its actions:

```bash
curl -X POST http://localhost:8000/api/services \
  -H "Content-Type: application/json" \
  -d '{ "intent": "explore", "service": "tasks", "action": "*", "payload": {} }'
```

```json
{
  "status": true,
  "message": "Actions for 'tasks'",
  "data": {
    "result": [
      {
        "name": "create",
        "description": "Create a new task",
        "isProtected": false,
        "validation": true
      }
    ]
  }
}
```

### Execute, call an action

This is the same call shown in Quick Start. Send `"intent": "execute"` with the service, action, and payload. The action's Zod schema validates the payload before the handler runs. If validation fails, you get a clear error:

```json
{
  "status": false,
  "message": "Validation failed: title - Required",
  "data": {}
}
```

### Schema, get JSON Schema for actions

Fetch the validation schema for any action as JSON Schema. This is what makes Nile AI-ready, an agent can read these schemas to know exactly what parameters an action accepts.

```bash
curl -X POST http://localhost:8000/api/services \
  -H "Content-Type: application/json" \
  -d '{ "intent": "schema", "service": "tasks", "action": "create", "payload": {} }'
```

```json
{
  "status": true,
  "message": "Schema for 'tasks.create'",
  "data": {
    "create": {
      "type": "object",
      "properties": {
        "title": { "type": "string", "minLength": 1 },
        "status": { "type": "string", "enum": ["pending", "in-progress", "done"], "default": "pending" }
      },
      "required": ["title"]
    }
  }
}
```

Use `"service": "*", "action": "*"` to get schemas for every action across all services in one call.

### Hooks, intercept and transform

Hooks let you run logic before or after an action executes. They work at two levels:

**Per-action hooks** point to other registered actions. A hook definition is just a reference, `{ service, action, isCritical }`, so any action can serve as a hook for any other action.

```typescript
export const createTaskAction: Action = createAction({
  name: "create",
  description: "Create a new task",
  validation: createTaskSchema,
  handler: createTaskHandler,
  hooks: {
    before: [
      { service: "audit", action: "logAccess", isCritical: false }
    ],
    after: [
      { service: "notifications", action: "notify", isCritical: false }
    ]
  },
});
```

Before hooks run sequentially and chain, each hook's output becomes the next hook's input. After hooks work the same way, receiving the handler's result.

When `isCritical` is `true`, a hook failure stops the pipeline. When `false`, failures are logged and skipped.

**Global hooks** run on every action. Define them in your server config:

```typescript
const server = createNileServer({
  serverName: "my-app",
  services,
  onBeforeActionHandler: ({ nileContext, action, payload }) => {
    // runs before every action, auth checks, logging, etc.
    return Ok(payload);
  },
  onAfterActionHandler: ({ nileContext, action, payload, result }) => {
    // runs after every action, transforms, auditing, etc.
    return result;
  },
});
```

The full execution pipeline runs in this order:

```txt
Global Before Hook
  -> Per-Action Before Hooks (sequential)
    -> Validation (Zod)
      -> Handler
    -> Per-Action After Hooks (sequential)
  -> Global After Hook
-> Response
```

Any step returning `Err` short-circuits the pipeline.

## Project Structure

```txt
my-api/
  server.ts
  services/
    config.ts
    tasks/
      create.ts
      list.ts
      get.ts
  db/
    schema.ts
    client.ts
    models/
      tasks.ts
```

## Contributing

> First developed by Hussein Kizz at [Nile Squad Labz](https://nilesquad.com) to power our own B2B saas products and services, and now open-sourced for the community. Over 1 year in the making, to now powering Agentic backends and open for community contributions.

Contributions are welcome.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -m 'Add your feature'`)
4. Push to the branch (`git push origin feature/your-feature`)
5. Open a Pull Request

## License

MIT
