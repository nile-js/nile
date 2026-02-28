# Database Utilities

## Purpose

Provides utilities for integrating with Drizzle ORM, including schema generation, transaction management, and a recommended **model file** pattern for organizing database operations.

## Constraints

- Requires `drizzle-orm` and `drizzle-zod` as peer dependencies.
- Intended for use with Drizzle-compatible databases (PostgreSQL, SQLite, etc.).

## 1. Folder Organization

Nile recommends a dedicated `db/` directory for all database concerns, with a `models/` subdirectory for data access functions:

```
src/
├── db/
│   ├── client.ts           # Database client setup (connection, ORM wrapper)
│   ├── schema.ts           # Drizzle table definitions
│   ├── types.ts            # Inferred types from schema
│   ├── index.ts            # Barrel exports
│   └── models/
│       ├── tasks.ts        # Model functions for the tasks table
│       ├── users.ts        # Model functions for the users table
│       └── index.ts        # Barrel re-exports all models
├── services/
│   └── ...                 # Action handlers import from @/db/models
└── index.ts                # Server entry point
```

Each layer has a clear responsibility:

| File | Responsibility |
|------|---------------|
| `client.ts` | Initialize the database connection and export the `db` instance |
| `schema.ts` | Define Drizzle table schemas (columns, types, defaults) |
| `types.ts` | Infer TypeScript types from the schema (`Task`, `NewTask`, etc.) |
| `models/*.ts` | CRUD functions that validate, query, and return `Result<T, string>` |
| `index.ts` | Barrel files for clean imports |

### Example: client.ts

```typescript
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { tasks } from "./schema";

const DATA_DIR = `${process.cwd()}/data`;
Bun.spawnSync(["mkdir", "-p", DATA_DIR]);

export const pglite = new PGlite(DATA_DIR);
export const db = drizzle(pglite, { schema: { tasks } });
```

### Example: schema.ts

```typescript
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const tasks = pgTable("tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status", { enum: ["pending", "in-progress", "done"] })
    .notNull()
    .default("pending"),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
```

### Example: types.ts

```typescript
import type { tasks } from "./schema";

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
```

## 2. Model Files

Model files are the core pattern for database operations in Nile. Each model file contains functions that interact with a single table, using consistent patterns for validation, error handling, and result returns.

### Key Principles

- **One model file per table** — `models/tasks.ts` handles all task operations
- **All model functions return `Result<T, string>`** — using `Ok()` for success and `handleError()` for failures
- **Null checks belong in model files** — not in action handlers. If a row is not found, the model returns `handleError(...)`, not the handler.
- **Use `safeTry` from `slang-ts`** for all database calls — check `result.isOk` / `result.isErr` and access `result.value` / `result.error`
- **Use `handleError` from `@nilejs/nile`** for all error returns — this logs the error and returns an `Err` with a traceable log ID
- **Use `getZodSchema`** for input validation before writes
- **Accept `dbx` parameter** for transaction support via `DBX<typeof db>`

### Full Model File Example

```typescript
// db/models/tasks.ts
import {
  createTransactionVariant,
  type DBX,
  getZodSchema,
  handleError,
} from "@nilejs/nile";
import { desc, eq } from "drizzle-orm";
import { Ok, safeTry } from "slang-ts";
import { db } from "@/db/client";
import { tasks } from "@/db/schema";
import type { NewTask, Task } from "@/db/types";

const parsedSchema = getZodSchema(tasks);

/** Create a new task with validation */
export const createTask = async ({
  task,
  dbx = db,
}: {
  task: NewTask;
  dbx?: DBX<typeof db>;
}) => {
  const parsed = parsedSchema.insert.safeParse(task);
  if (!parsed.success) {
    return handleError({
      message: "Invalid task data",
      data: { errors: parsed.error },
      atFunction: "createTask",
    });
  }

  const result = await safeTry(() => {
    return dbx.insert(tasks).values(task).returning();
  });
  if (result.isErr) {
    return handleError({
      message: "Error creating task",
      data: { task, error: result.error },
      atFunction: "createTask",
    });
  }

  const data = result.value?.[0] ?? null;
  if (!data) {
    return handleError({
      message: "Task creation returned no data",
      data: { task },
      atFunction: "createTask",
    });
  }
  return Ok(data);
};

// Transaction-aware variant — automatically wraps in db.transaction(...)
export const createTaskTx = createTransactionVariant(createTask);

/** Get a single task by ID */
export const getTaskById = async (taskId: string) => {
  const result = await safeTry(() => {
    return db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  });
  if (result.isErr) {
    return handleError({
      message: "Error getting task",
      data: { taskId, error: result.error },
      atFunction: "getTaskById",
    });
  }

  // Null check in the model, not the handler
  if (!result.value) {
    return handleError({
      message: "Task not found",
      data: { taskId },
      atFunction: "getTaskById",
    });
  }
  return Ok(result.value);
};

/** Update an existing task by ID */
export const updateTask = async ({
  taskId,
  task,
  dbx = db,
}: {
  taskId: string;
  task: Partial<Task>;
  dbx?: DBX<typeof db>;
}) => {
  const parsed = parsedSchema.update.safeParse(task);
  if (!parsed.success) {
    return handleError({
      message: "Invalid task data",
      data: { errors: parsed.error },
      atFunction: "updateTask",
    });
  }

  const result = await safeTry(() => {
    return dbx.update(tasks).set(task).where(eq(tasks.id, taskId)).returning();
  });
  if (result.isErr) {
    return handleError({
      message: "Error updating task",
      data: { taskId, task, error: result.error },
      atFunction: "updateTask",
    });
  }

  const data = result.value?.[0] ?? null;
  if (!data) {
    return handleError({
      message: "Task not found",
      data: { taskId },
      atFunction: "updateTask",
    });
  }
  return Ok(data);
};

export const updateTaskTx = createTransactionVariant(updateTask);

/** Delete a task by ID */
export const deleteTask = async (taskId: string) => {
  const result = await safeTry(() => {
    return db.delete(tasks).where(eq(tasks.id, taskId)).returning();
  });
  if (result.isErr) {
    return handleError({
      message: "Error deleting task",
      data: { taskId, error: result.error },
      atFunction: "deleteTask",
    });
  }

  const data = result.value?.[0] ?? null;
  if (!data) {
    return handleError({
      message: "Task not found",
      data: { taskId },
      atFunction: "deleteTask",
    });
  }
  return Ok(data);
};

/** List all tasks, newest first */
export const getAllTasks = async () => {
  const result = await safeTry(() => {
    return db.select().from(tasks).orderBy(desc(tasks.created_at));
  });
  if (result.isErr) {
    return handleError({
      message: "Error getting all tasks",
      data: { error: result.error },
      atFunction: "getAllTasks",
    });
  }

  return Ok(result.value ?? []);
};
```

### How Action Handlers Use Models

Action handlers stay thin — they call the model function and forward the result:

```typescript
// services/tasks/create.ts
import { type Action, createAction } from "@nilejs/nile";
import { Err, Ok } from "slang-ts";
import z from "zod";
import { createTask } from "@/db/models";

const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional().default(""),
  status: z.enum(["pending", "in-progress", "done"]).optional().default("pending"),
});

const createTaskHandler = async (data: Record<string, unknown>) => {
  const result = await createTask({
    task: {
      title: data.title as string,
      description: (data.description as string) ?? "",
      status: (data.status as "pending" | "in-progress" | "done") ?? "pending",
    },
  });
  if (result.isErr) {
    return Err(result.error);
  }
  return Ok({ task: result.value });
};

export const createTaskAction: Action = createAction({
  name: "create",
  description: "Create a new task",
  handler: createTaskHandler,
  validation: createTaskSchema,
});
```

## 3. handleError

The `handleError` utility is the standard way to return errors from model functions. It logs the error and returns a traceable `Err` result.

### Usage

```typescript
import { handleError } from "@nilejs/nile";

// In a model function:
if (!result.value) {
  return handleError({
    message: "Task not found",
    data: { taskId },
    atFunction: "getTaskById",
  });
}
```

### Behavior

1. **Logger resolution** — uses the explicit `logger` param if provided, otherwise resolves from `getContext().resources.logger`
2. **Caller inference** — parses `Error().stack` to detect the calling function name. Override with `atFunction` when needed (arrow functions, callbacks)
3. **Logging** — calls `logger.error({ atFunction, message, data })` and receives a `log_id` back
4. **Return** — returns `Err("[log_id] message")`, making every error traceable in logs

### Interface

```typescript
interface HandleErrorParams {
  message: string;        // Human-readable error description
  data?: unknown;         // Structured context data for debugging
  logger?: NileLogger;    // Explicit logger (optional — resolved from context)
  atFunction?: string;    // Override auto-inferred caller name
}
```

### Return Type

```typescript
ErrType<string> & ResultMethods<never>
```

Always returns an `Err` variant. Compatible with any `Result<T, E>` union, so model functions can return `Ok(data)` or `handleError(...)` from the same function.

### Why handleError Instead of Err()

- **Traceability** — every error gets a unique `log_id` for log correlation
- **Automatic logging** — errors are logged at the error site, not somewhere upstream
- **Context-aware** — resolves the logger from the Nile context without explicit imports
- **Consistent** — all errors follow the same `[logId] message` format

## 4. Key Types

### DBX

```typescript
type DBX<TDB> = TDB | Parameters<Parameters<TDB["transaction"]>[0]>[0];
```

A union type representing either a root database instance or a transaction pointer. Used in model function signatures to accept both:

```typescript
export const createTask = async ({
  task,
  dbx = db,    // defaults to root db, but accepts a transaction
}: {
  task: NewTask;
  dbx?: DBX<typeof db>;
}) => { ... };
```

### DBParams

```typescript
interface DBParams<TDB> {
  dbx?: DBX<TDB>;
}
```

Standard interface for functions that accept an optional database or transaction parameter.

### TableSchemas

```typescript
interface TableSchemas<TTable> {
  insert: ZodObject<ZodRawShape>;
  update: ZodObject<ZodRawShape>;
  select: ZodObject<ZodRawShape>;
}
```

Object containing Zod schemas for insert, update, and select operations. Generated by `getZodSchema`.

## 5. Utilities

### getZodSchema

Generates Zod validation schemas from a Drizzle table definition:

```typescript
import { getZodSchema } from "@nilejs/nile";
import { tasks } from "@/db/schema";

const parsedSchema = getZodSchema(tasks);

// parsedSchema.insert  — for validating new records
// parsedSchema.update  — for validating partial updates
// parsedSchema.select  — for validating query results
```

Call this once per table at module scope and reuse across model functions.

### getContext

Retrieves the shared Nile context with type-safe database access:

```typescript
import { getContext } from "@nilejs/nile";

const handler = async (data: any) => {
  const db = getContext<MyDatabase>().resources?.database;
  if (!db) return Err("Database not found");

  const results = await db.select().from(users);
  return Ok(results);
};
```

### createTransactionVariant

Creates a transaction-aware wrapper around a model function. When called, it automatically wraps the operation in `db.transaction(...)` and triggers rollback if the function returns `Err`.

```typescript
import { createTransactionVariant } from "@nilejs/nile";

// Standard model function
const createTask = async ({ task, dbx = db }: { task: NewTask; dbx?: DBX<typeof db> }) => {
  // ... validate, insert, return Ok or handleError
};

// Transaction variant — wraps in db.transaction automatically
const createTaskTx = createTransactionVariant(createTask);

// Usage: automatically runs inside a transaction
const result = await createTaskTx({ task: data, dbx: db });
```

**Behavior:**
- Wraps the function call inside `dbx.transaction(tx => fn({ ...params, dbx: tx }))`
- If the inner function returns `Err`, the transaction wrapper throws to trigger rollback
- The thrown error is caught and the original `Err` is returned to the caller

## 6. Putting It All Together

A complete Nile project with database integration follows this structure:

```
my-app/
├── src/
│   ├── index.ts                    # Server entry point
│   ├── db/
│   │   ├── client.ts               # DB connection setup
│   │   ├── schema.ts               # Drizzle table definitions
│   │   ├── types.ts                # Inferred types
│   │   ├── index.ts                # Barrel exports
│   │   └── models/
│   │       ├── tasks.ts            # CRUD for tasks table
│   │       ├── users.ts            # CRUD for users table
│   │       └── index.ts            # Barrel re-exports
│   └── services/
│       ├── services.config.ts      # Service definitions
│       └── tasks/
│           ├── create.ts           # Action: calls createTask model
│           ├── list.ts             # Action: calls getAllTasks model
│           ├── get.ts              # Action: calls getTaskById model
│           ├── update.ts           # Action: calls updateTask model
│           └── delete.ts           # Action: calls deleteTask model
├── package.json
├── tsconfig.json                   # Path alias: @/* → ./src/*
└── drizzle.config.ts               # Drizzle Kit config
```

The data flows in one direction:

```
Request → Action Handler → Model Function → Database
                ↑                  ↓
            Ok/Err            Ok/handleError
```

Action handlers never touch the database directly. They call model functions, which validate inputs, run queries via `safeTry`, handle null checks, and return typed `Result` values.

## 7. Failure Modes

- **`getZodSchema`** — throws if passed a relation schema instead of a table schema
- **`createTransactionVariant`** — throws when the wrapped function returns `Err` (intentional, triggers rollback)
- **`handleError`** — throws if no logger is available (neither explicit nor on context)
