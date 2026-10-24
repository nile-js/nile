---
title: "Database models"
description: "Create typed model helpers from a Drizzle table for inserts, lookups, updates, deletes and pagination"
---

`createModel` turns a Drizzle table into a set of helpers that return Results. Your actions call the helpers instead of building queries inline, and validation, error handling and pagination follow one pattern across the application.

## When to use it

Use a model for each table that actions read or write. Keep joins, reports and custom queries next to the model in the same domain folder, and use the table and schemas the model exposes when you write them.

## Complete example

The table is an ordinary Drizzle table. The model is created from it with a database client. The action validates input with Zod, calls `create`, and returns the saved row or the failure.

```ts
import { createAction, createModel, createServices } from "@nilejs/nile";
import { Err, Ok } from "@nilejs/nile/fp";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { z } from "zod";

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
    .defaultNow(),
});

export const taskModel = createModel(tasks, {
  db: database,
  name: "task",
});

const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional().default(""),
});

type CreateTaskInput = z.infer<typeof createTaskSchema>;

const createTaskHandler = async (input: CreateTaskInput) => {
  const created = await taskModel.create({
    data: {
      title: input.title,
      description: input.description,
    },
  });

  if (created.isErr) {
    return Err(created.error);
  }

  return Ok({ task: created.value });
};

const createTaskAction = createAction<CreateTaskInput>({
  name: "create",
  description: "Create a task",
  validation: createTaskSchema,
  handler: createTaskHandler,
});

const listTasksHandler = async () => {
  const page = await taskModel.findPaginated({ limit: 20, offset: 0 });

  if (page.isErr) {
    return Err(page.error);
  }

  return Ok({ tasks: page.value.items, hasMore: page.value.hasMore });
};

const listTasksAction = createAction<undefined>({
  name: "list",
  description: "List the first page of tasks",
  handler: listTasksHandler,
});

export const services = createServices([
  {
    name: "tasks",
    description: "Task management",
    actions: [createTaskAction, listTasksAction],
  },
]);
```

The `database` value is the Drizzle client your application creates. It is declared as a global in the snippet so the file type-checks on its own. The starter's `src/db/client.ts` creates it for you.

## Methods

| Method | Success value | Failure when |
| --- | --- | --- |
| `create({ data, dbx? })` | Inserted row | Data does not match the insert schema, or the insert fails. |
| `findById(id)` | Matching row | No row matches. |
| `update({ id, data, dbx? })` | Updated row | No row matches, or data does not match the update schema. |
| `delete(id)` | Deleted row | No row matches. |
| `findAll()` | Array of rows | The query fails. An empty table returns an empty array. |
| `findPaginated({ limit?, offset? })` | `{ items, total, hasMore }` | The query fails. |
| `findPaginated({ limit?, cursor, cursorColumn? })` | `{ items, nextCursor, hasMore }` | The query fails. |

Each method returns a Result. Check `isErr` before reading `value`.

## Options that matter

| Option | Effect |
| --- | --- |
| `name` | Readable label used in error messages and logs. |
| `db` | Drizzle client. If omitted, the model reads `resources.database` from the current context when a method runs. |
| `cursorColumn` | Column used for cursor pages. Defaults to `id`. |
| `limit` | Page size for `findPaginated`. Defaults to 50. |

The model also exposes `table` and `schemas.insert`, `schemas.update` and `schemas.select`. Use them in custom queries so they stay in step with the table.

## How it behaves

- `create` and `update` check the data against the generated Zod schemas before they query. They write the data you supplied.
- Offset pagination uses a count of the whole table. Cursor pages fetch one extra row to decide whether another page exists.
- `findAll` and offset pagination sort by `created_at` when the table has it. Otherwise no default order applies.
- Query failures are logged with bounded diagnostics and returned as a safe failure. Driver messages that may contain data are not returned.
- `createTx` and `updateTx` run inside a transaction only when you pass `dbx`. Omitting `dbx` does not start one.

## Limits

- The helpers cover single-table work. Multi-step writes need an explicit transaction.
- Cursor pages need a column that is unique and ordered. `id` works for UUIDs only if it sorts the way you want.
- A transaction-wrapped Err is thrown to roll back. Guard that call with `safeTry`.

## Common mistakes

- Treating a missing row as `null`. `findById` returns a failure, so check `isErr`.
- Calling `createTx` without `dbx`, then expecting rollback on failure.
- Paginating with a non-unique cursor column. Rows with the same value can be skipped or repeated.
- Writing raw SQL in the action when a model method covers the case.

## See also

- [Model helpers](/guide/internals/db/create-model) has the complete method reference.
- [Data access overview](/guide/internals/db/) covers multi-write workflows.
- [Shared utilities](/guide/reference/shared-utilities) explains `dbTry` and safe database failures.
