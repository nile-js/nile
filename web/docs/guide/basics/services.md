# Services

Services group related actions together. A service is a logical container that organizes your actions under a common namespace.

## Defining a Service

Services are plain objects with a name, description, and array of actions:

```typescript
import { createActions, type Services } from "@nilejs/nile";
import { createTaskAction } from "./tasks/create";
import { listTaskAction } from "./tasks/list";

export const services: Services = [
  {
    name: "tasks",
    description: "Task management with CRUD operations",
    actions: createActions([createTaskAction, listTaskAction]),
  },
];
```

## Options

| Option | Type | Description |
|--------|------|-------------|
| `name` | `string` | Unique identifier for the service |
| `description` | `string` | Human-readable description |
| `actions` | `Action[]` | Array of actions belonging to this service |
| `meta` | `Record<string, unknown>` | Optional metadata for the service |

## Example: Full Service Setup

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

```typescript
// services/tasks/list.ts
import { Ok } from "slang-ts";
import { createAction, type Action } from "@nilejs/nile";

const listTaskHandler = () => {
  return Ok({
    tasks: [
      { id: "1", title: "Learn Nile", status: "pending" },
      { id: "2", title: "Build something", status: "done" },
    ],
  });
};

export const listTaskAction: Action = createAction({
  name: "list",
  description: "List all tasks",
  handler: listTaskHandler,
});
```

```typescript
// services/tasks.ts
import { createActions, type Services } from "@nilejs/nile";
import { createTaskAction } from "./tasks/create";
import { listTaskAction } from "./tasks/list";

export const services: Services = [
  {
    name: "tasks",
    description: "Task management operations",
    actions: createActions([createTaskAction, listTaskAction]),
  },
];
```

## Using Services in the Server

```typescript
// server.ts
import { createNileServer } from "@nilejs/nile";
import { services } from "./services/tasks";

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

## Invoking Actions

Once the server is running, invoke actions via POST to `/api/services`:

```bash
curl -X POST http://localhost:8000/api/services \
  -H "Content-Type: application/json" \
  -d '{
    "intent": "execute",
    "service": "tasks",
    "action": "list",
    "payload": {}
  }'
```
