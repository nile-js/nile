---
title: Getting Started
description: Installation, basic setup, and your first Nile server
---

# Getting Started with Nile

Nile is a functional-first, type-safe backend framework built on Hono. It works with **Bun**, **Node.js**, and **Deno**, uses Zod for validation, and returns Results from all action handlers using the `Ok` / `Err` pattern from `slang-ts`.

## 1. Installation

:::tabs

@tab Bun

```bash
bun add @nilejs/nile zod slang-ts
```

@tab npm

```bash
npm install @nilejs/nile zod slang-ts
```

@tab pnpm

```bash
pnpm add @nilejs/nile zod slang-ts
```

:::

## 2. Quick Start

### 2.1 Create Actions

Actions are the core building blocks. Each action has a name, optional Zod validation schema, and a handler that returns a `Result`.

```typescript
// services/todos/create.ts
import { Ok } from "slang-ts";
import z from "zod";
import { createAction, type Action } from "@nilejs/nile";

const createTodoSchema = z.object({
  title: z.string().min(1, "Title is required"),
  completed: z.boolean().default(false),
});

const createTodoHandler = (data: Record<string, unknown>) => {
  const todo = {
    id: crypto.randomUUID(),
    title: data.title as string,
    completed: (data.completed as boolean) ?? false,
  };
  return Ok({ todo });
};

export const createTodoAction: Action = createAction({
  name: "create",
  description: "Create a new todo",
  validation: createTodoSchema,
  handler: createTodoHandler,
});
```

### 2.2 Group Actions into a Service

```typescript
// services/todos/list.ts
import { Ok } from "slang-ts";
import { createAction, type Action } from "@nilejs/nile";

const listTodoHandler = () => {
  return Ok({
    todos: [
      { id: "1", title: "Learn Nile", completed: false },
      { id: "2", title: "Build an API", completed: true },
    ],
  });
};

export const listTodoAction: Action = createAction({
  name: "list",
  description: "List all todos",
  handler: listTodoHandler,
});
```

```typescript
// services/todos.ts
import { createActions, type Services } from "@nilejs/nile";
import { createTodoAction } from "./create";
import { listTodoAction } from "./list";

export const services: Services = [
  {
    name: "todos",
    description: "Todo list management",
    actions: createActions([createTodoAction, listTodoAction]),
  },
];
```

### 2.3 Create and Start the Server

```typescript
// server.ts
import { createNileServer } from "@nilejs/nile";
import { services } from "./services/todos";

const server = createNileServer({
  serverName: "my-app",
  services,
  rest: {
    baseUrl: "/api",
    port: 3000,
  },
});

if (server.rest) {
  const { fetch } = server.rest.app;
  Bun.serve({ fetch, port: 3000 });
  console.log("Server running at http://localhost:3000");
}
```

Run with Bun:

```bash
bun run server.ts
```

### 2.4 Invoke Your Actions

Nile uses a single POST endpoint with an intent-driven payload:

```bash
# List todos
curl -X POST http://localhost:3000/api/services \
  -H "Content-Type: application/json" \
  -d '{
    "intent": "execute",
    "service": "todos",
    "action": "list",
    "payload": {}
  }'

# Create a todo
curl -X POST http:localhost:3000/api/services \
  -H "Content-Type: application/json" \
  -d '{
    "intent": "execute",
    "service": "todos",
    "action": "create",
    "payload": { "title": "Ship Nile", "completed": false }
  }'
```

## 3. Project Structure

```
my-api/
├── server.ts                  # Entry point
├── services/
│   ├── todos.ts               # Service definition
│   └── todos/
│       ├── create.ts          # Action: create todo
│       └── list.ts            # Action: list todos
└── package.json
```

## 4. Next Steps

- Learn about [Actions](/guide/basics/actions) and [Services](/guide/basics/services)
- Explore the [Context](/guide/basics/context) for accessing resources like databases
- Set up a [database layer with model files](/guide/internals/db) for structured data access
- See [Server Configuration](/guide/internals/server) for more options

*This documentation reflects the current implementation and is subject to evolution.*
