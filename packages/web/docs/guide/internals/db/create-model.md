# createModel

CRUD model factory for Drizzle tables. Replaces repetitive `safeTry` + `handleError` + null-check boilerplate with a single function call.

## Signature

```typescript
import { createModel } from '@nilejs/nile';

const taskModel = createModel(table, options);
```

```typescript
function createModel<TTable, TDB>(
  table: TTable,
  options: ModelOptions<TDB>
): ModelOperations<TSelect, TInsert, TDB>
```

## Inputs

### `table` (required)

A Drizzle table definition created via `pgTable`, `sqliteTable`, etc.

```typescript
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status', { enum: ['pending', 'in-progress', 'done'] })
    .notNull()
    .default('pending'),
  created_at: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
```

Must be a real Drizzle table object — it carries internal Symbol-keyed metadata that `getZodSchema` (via `drizzle-zod`) needs to auto-generate validation schemas. Plain objects will fail.

### `options: ModelOptions<TDB>` (required)

```typescript
interface ModelOptions<TDB = unknown> {
  db?: TDB;
  name: string;
  cursorColumn?: string;
}
```

#### `options.name` (required)

Human-readable entity name. Used in error messages and `handleError` attribution.

```typescript
createModel(tasks, { name: 'task' });
// Error messages: "Task not found", "Error creating task"
// atFunction values: "task.create", "task.findById", etc.
```

Auto-capitalized for user-facing messages: `"task"` → `"Task not found"`.

#### `options.db` (optional)

Explicit Drizzle database instance. Accepts any Drizzle driver (Neon, PGLite, etc.).

```typescript
import { db } from './client';

// Explicit — db is fixed at factory creation time
const model = createModel(tasks, { db, name: 'task' });

// Omitted — db resolved from Nile context at each method call
const model = createModel(tasks, { name: 'task' });
```

When omitted, each method call resolves the db via `getContext().resources.database`. This supports request-scoped database access in Nile's context system.

Throws immediately if neither explicit db nor context db is available: `"createModel: No database available."`.

#### `options.cursorColumn` (optional, default: `"id"`)

Default column name for cursor-based pagination. Can be overridden per-query.

```typescript
// Model-level: paginate by created_at by default
const model = createModel(tasks, { db, name: 'task', cursorColumn: 'created_at' });

// Per-query override
await model.findPaginated({ limit: 20, cursor: 'abc', cursorColumn: 'id' });
```

## Output

Returns `ModelOperations<TSelect, TInsert, TDB>` where type parameters are inferred from the Drizzle table:

- `TSelect` — row type from select queries (`table.$inferSelect`)
- `TInsert` — data type for inserts (`table.$inferInsert`)
- `TDB` — database type for transaction support

All async methods return `Result<T, string>` from `slang-ts`.

### CRUD Methods

#### `create({ data, dbx? })`

Insert a new record with auto-validation.

```typescript
create(params: {
  data: TInsert;       // Validated against auto-generated insert schema
  dbx?: DBX<TDB>;     // Optional transaction pointer
}): Promise<Result<TSelect, string>>
```

Returns `Err` if validation fails, insert returns empty, or db throws.

#### `createTx({ data, dbx? })`

Same as `create`, wrapped in a database transaction via `createTransactionVariant`. Rolls back on `Err`.

#### `findById(id)`

Find a single record by UUID.

```typescript
findById(id: string): Promise<Result<TSelect, string>>
```

Returns `Err("{Name} not found")` when no row matches.

#### `update({ id, data, dbx? })`

Update a record by UUID with auto-validation.

```typescript
update(params: {
  id: string;
  data: Partial<TSelect>;  // Validated against auto-generated update schema
  dbx?: DBX<TDB>;
}): Promise<Result<TSelect, string>>
```

Returns `Err("{Name} not found")` when no row matches the id.

#### `updateTx({ id, data, dbx? })`

Same as `update`, wrapped in a database transaction. Rolls back on `Err`.

#### `delete(id)`

Delete a record by UUID, returns the deleted row.

```typescript
delete(id: string): Promise<Result<TSelect, string>>
```

#### `findAll()`

Get all records. Auto-orders by `created_at` or `createdAt` descending when that column exists on the table.

```typescript
findAll(): Promise<Result<TSelect[], string>>
```

Returns `Ok([])` for empty tables — not an error.

#### `findPaginated(options?)`

Two modes, determined by which options are passed.

**Offset mode** (default — no `cursor` provided):

```typescript
await model.findPaginated({ limit: 20, offset: 0 });
```

```typescript
interface OffsetPaginationOptions {
  limit?: number;   // Default: 50
  offset?: number;  // Default: 0
}
```

Returns:
```typescript
interface OffsetPage<T> {
  items: T[];
  total: number;     // Total count across all pages
  hasMore: boolean;  // offset + items.length < total
}
```

**Cursor mode** (when `cursor` is provided):

```typescript
await model.findPaginated({ limit: 20, cursor: 'abc-123', cursorColumn: 'created_at' });
```

```typescript
interface CursorPaginationOptions {
  limit?: number;        // Default: 50
  cursor: string;        // Value to paginate from
  cursorColumn?: string; // Overrides model-level default
}
```

Returns:
```typescript
interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;  // Pass as cursor for next page
  hasMore: boolean;
}
```

Uses `lt()` on the cursor column with `desc` ordering. Fetches `limit + 1` rows to determine `hasMore` without a separate count query.

### Escape Hatches

#### `table`

The original Drizzle table. Use for custom queries beyond CRUD.

```typescript
const db = getContext().resources.database;
const active = await db.select().from(model.table).where(eq(model.table.status, 'active'));
```

#### `schemas`

Auto-generated Zod schemas from the Drizzle table via `getZodSchema`.

```typescript
model.schemas.insert  // For validating create data
model.schemas.update  // For validating update data
model.schemas.select  // For validating query results
```

## Example

### Model definition

```typescript
// db/models/tasks.ts
import { createModel } from '@nilejs/nile';
import { tasks } from '../schema';
import { db } from '../client';

export const taskModel = createModel(tasks, { db, name: 'task' });
```

### Usage in action handlers

```typescript
// services/tasks/create.ts
import { taskModel } from '../../db/models';

const handler = async (data: Record<string, unknown>) => {
  const result = await taskModel.create({
    data: { title: data.title as string },
  });
  if (result.isErr) return Err(result.error);
  return Ok({ task: result.value });
};
```

```typescript
// services/tasks/list.ts
const handler = async () => {
  return taskModel.findAll();
};
```

```typescript
// services/tasks/get.ts
const handler = async (data: Record<string, unknown>) => {
  return taskModel.findById(data.taskId as string);
};
```

### Custom queries via escape hatch

```typescript
import { eq } from 'drizzle-orm';

const db = getContext().resources.database;
const pending = await db
  .select()
  .from(taskModel.table)
  .where(eq(taskModel.table.status, 'pending'));
```

## Internals

### DB Resolution

```
method call → options.db exists? → use it
                    ↓ no
             getContext().resources.database exists? → use it
                    ↓ no
             throw "No database available"
```

Resolution is lazy (at call time, not factory creation) so context-based apps work correctly.

### Validation Flow

```
create/update → schemas.insert/update.safeParse(data)
                    ↓ fails → handleError("Invalid {name} data")
                    ↓ passes → execute db query
```

### Error Handling

All errors go through `handleError`:
1. Resolves logger from explicit param or Nile context
2. Logs with `atFunction` attribution (e.g. `task.create`)
3. Returns `Err("[logId] message")` with traceable log ID

### Auto-Ordering

`findAll` and offset `findPaginated` auto-detect timestamp columns:
1. Checks for `created_at` on the table
2. Falls back to `createdAt`
3. No ordering applied if neither exists

## Failure Modes

| Scenario | Behavior |
|---|---|
| No db available (explicit or context) | Throws immediately — developer config error |
| Validation fails | Returns `Err` with validation details |
| DB query throws | Returns `Err` via `handleError` |
| Row not found (findById, update, delete) | Returns `Err("{Name} not found")` |
| Insert returns empty | Returns `Err("{Name} creation returned no data")` |
| Invalid cursor column | Returns `Err("Cursor column '{col}' does not exist on {name} table")` |

## Pairing with createServices

`createModel` eliminates model boilerplate. Pair it with `createServices` to eliminate the service/action layer boilerplate too. Together they reduce a full CRUD service from ~250 lines across 7 files to ~40 lines across 3 files.

### The pattern

```
Schema (pgTable)
  └─ createModel  → CRUD model (1 line)
       └─ Service config (with direct action arrays) → CRUD actions (5 action definitions)
            └─ done
```

### Step 1: Model — one line

```typescript
// db/models/tasks.ts
import { createModel } from '@nilejs/nile';
import { tasks } from '../schema';
import { db } from '../client';

export const taskModel = createModel(tasks, { db, name: 'task' });
```

### Step 2: Actions — each handler calls one model method

```typescript
// services/tasks/create.ts
import { createAction, type Action } from '@nilejs/nile';
import { Err, Ok } from 'slang-ts';
import z from 'zod';
import { taskModel } from '@/db/models';

const createTaskSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional().default(''),
  status: z.enum(['pending', 'in-progress', 'done']).optional().default('pending'),
});

const createTaskHandler = async (data: Record<string, unknown>) => {
  const result = await taskModel.create({
    data: {
      title: data.title as string,
      description: (data.description as string) ?? '',
      status: (data.status as 'pending' | 'in-progress' | 'done') ?? 'pending',
    },
  });
  if (result.isErr) return Err(result.error);
  return Ok({ task: result.value });
};

export const createTaskAction: Action = createAction({
  name: 'create',
  description: 'Create a new task',
  handler: createTaskHandler,
  validation: createTaskSchema,
});
```

```typescript
// services/tasks/list.ts
import { createAction, type Action } from '@nilejs/nile';
import { Err, Ok } from 'slang-ts';
import { taskModel } from '@/db/models';

const listTasksHandler = async () => {
  const result = await taskModel.findAll();
  if (result.isErr) return Err(result.error);
  return Ok({ tasks: result.value });
};

export const listTaskAction: Action = createAction({
  name: 'list',
  description: 'List all tasks',
  handler: listTasksHandler,
});
```

```typescript
// services/tasks/get.ts
const getTaskHandler = async (data: Record<string, unknown>) => {
  const result = await taskModel.findById(data.id as string);
  if (result.isErr) return Err(result.error);
  return Ok({ task: result.value });
};
```

```typescript
// services/tasks/update.ts
const updateTaskHandler = async (data: Record<string, unknown>) => {
  const { id, ...updates } = data;
  const result = await taskModel.update({ id: id as string, data: updates });
  if (result.isErr) return Err(result.error);
  return Ok({ task: result.value });
};
```

```typescript
// services/tasks/delete.ts
const deleteTaskHandler = async (data: Record<string, unknown>) => {
  const result = await taskModel.delete(data.id as string);
  if (result.isErr) return Err(result.error);
  return Ok({ deleted: true, id: data.id });
};
```

### Step 3: Wire into services

```typescript
// services/services.config.ts
import { createServices, type Services } from '@nilejs/nile';
import { createTaskAction } from './tasks/create';
import { deleteTaskAction } from './tasks/delete';
import { getTaskAction } from './tasks/get';
import { listTaskAction } from './tasks/list';
import { updateTaskAction } from './tasks/update';

export const services: Services = createServices([
  {
    name: 'tasks',
    description: 'Task management with CRUD operations',
    actions: [
      createTaskAction,
      listTaskAction,
      getTaskAction,
      updateTaskAction,
      deleteTaskAction,
    ],
  },
]);
```

### What each layer handles

| Concern | Handled by |
|---|---|
| Table schema, columns, defaults | `pgTable` (Drizzle) |
| Validation, CRUD queries, error handling, transactions | `createModel` |
| Input schemas, business logic wrapping, response shaping | `createAction` per action |
| Type-safe action grouping, service registration | `createServices` with direct action arrays |
| Routing, execution pipeline, hooks | Nile engine (automatic) |

### When to go beyond this pattern

The `createModel` + `createServices` pattern covers standard CRUD. Go custom when you need:

- **Complex queries**: Joins, aggregations, CTEs — use `model.table` escape hatch with raw Drizzle
- **Multi-model operations**: Actions that span multiple models or have complex business logic
- **Non-CRUD actions**: Search, bulk operations, file processing — write a custom handler
- **Custom hooks**: Before/after hooks that modify data or enforce business rules — use the [hooks system](/guide/basics/actions)

## vs Manual Model Files

`createModel` replaces the manual model pattern documented in the [Database Overview](./index). Use it for standard CRUD. For custom queries, complex joins, or non-standard patterns, write manual model functions using `safeTry` + `handleError` directly and use the `table` escape hatch.
