# Actions

Actions are the core building blocks of Nile. Each action represents a single operation that can be called via the REST-RPC interface.

## createAction

```typescript
import { Ok, Err } from "slang-ts";
import { createAction, type Action } from "@nilejs/nile";

export const myAction: Action = createAction({
  name: "actionName",
  description: "What this action does",
  handler: (data) => {
    // Return Ok with data on success
    return Ok({ result: "success" });
    // Or return Err on failure
    // return Err("Something went wrong");
  },
});
```

## Options

| Option | Type | Description |
|--------|------|-------------|
| `name` | `string` | Unique identifier for the action |
| `description` | `string` | Human-readable description |
| `validation` | `z.ZodTypeAny \| null` | Optional Zod schema for input validation |
| `handler` | `ActionHandler` | The function that executes when the action is called |
| `isProtected` | `boolean` | If true, requires authentication |
| `visibility` | `{ rest?: boolean; rpc?: boolean }` | Control which interfaces expose this action |

## Handler Signature

The handler receives input data and context, and must return a `Result<T, E>` from `slang-ts`:

```typescript
import type { Result } from "slang-ts";
import type { NileContext } from "@nilejs/nile";

type ActionHandler<T = unknown, E = string> = (
  data: Record<string, unknown>,
  context?: NileContext<unknown>
) => Result<T, E> | Promise<Result<T, E>>;
```

Use `Ok(data)` for success and `Err(error)` for failures:

```typescript
handler: (data) => {
  if (!data.requiredField) {
    return Err("Required field is missing");
  }
  return Ok({ id: "1", name: "Item" });
},
```

## Example: Action with Validation

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

## Multiple Actions

Actions are typically defined in separate files and then grouped into a service:

```typescript
// services/tasks/create.ts
import { Ok } from "slang-ts";
import z from "zod";
import { createAction, type Action } from "@nilejs/nile";

const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required"),
});

const createTaskHandler = (data: Record<string, unknown>) => {
  return Ok({ task: { id: crypto.randomUUID(), title: data.title } });
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

export const listTaskAction: Action = createAction({
  name: "list",
  description: "List all tasks",
  handler: () => Ok({ tasks: [] }),
});
```

Then group them in the service config:

```typescript
// services/tasks.ts
import { createServices, type Services } from "@nilejs/nile";
import { createTaskAction } from "./tasks/create";
import { listTaskAction } from "./tasks/list";

export const services: Services = createServices([
  {
    name: "tasks",
    description: "Task management",
    actions: [createTaskAction, listTaskAction],
  },
]);
```

## Accessing Context

The handler receives a second parameter with access to resources:

```typescript
handler: (data, context) => {
  // Access database from context
  const users = await context.database.query.users.findMany();
  
  // Access logger
  context.logger.info({ atFunction: "myAction", message: "Processing" });
  
  return Ok({ count: users.length });
}
```
