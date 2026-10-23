---
title: "Model helpers"
description: "Create a Drizzle-backed model with typed CRUD methods and Result failures"
---

Use `createModel` when a Drizzle-backed domain needs familiar CRUD operations. Keep custom business queries in ordinary model functions rather than forcing every operation through a generic helper.

## Create a model

This example assumes your application already defines the Drizzle table and database client; it does not create or migrate a database.

```ts
import { utils } from "@nilejs/nile";
import { db } from "../client";
import { projects } from "../schema";

export const projectModel = utils.createModel(projects, {
  name: "project",
  db,
});
```

The table must be a real Drizzle table, not a plain object or a relation definition. Row/insert types come from that table. `name` supplies readable error attribution. `cursorColumn` defaults to `id`.

Omit `db` to resolve `resources.database` from the current Nile context at method-call time. This is shared application-resource access, not an automatically created per-request database connection. Missing configuration throws when a method needs the database.

## Reuse the table schemas

Use `utils.getZodSchema` when a custom model function needs the same insert, update and select schemas. This fragment uses the `projects` table and `utils` import from the model example above:

```ts
const projectSchemas = utils.getZodSchema(projects);
const checked = projectSchemas.insert.safeParse({ name: "Customer portal" });
```

Check `checked.success` before reading `checked.data`. A model also exposes its schemas at `projectModel.schemas`, so actions and custom data functions can share the table contract.

## Methods

| Method | Result data |
| --- | --- |
| `create({ data, dbx? })` | Inserted row. |
| `findById(id)` | Matching row; missing data returns an Err. |
| `update({ id, data, dbx? })` | Updated row; missing data returns an Err. |
| `delete(id)` | Deleted row; missing data returns an Err. |
| `findAll()` | Rows, including an empty array when no rows exist. |
| `findPaginated({ limit?, offset? })` | `{ items, total, hasMore }`. |
| `findPaginated({ limit?, cursor, cursorColumn? })` | `{ items, nextCursor, hasMore }`. |

Ordinary methods return `Promise<Result<T, string>>`. `create` and `update` check their data against the generated insert/update schemas, then execute their queries. They validate the supplied data; they do not substitute the schema’s transformed output into the write.

Pagination defaults to 50 items. Offset mode is selected without a cursor. Cursor mode uses descending order and a less-than comparison on the selected column, fetching an extra row to detect another page. Choose a suitable stable cursor for your data; the helper does not add a multi-column tie-breaker automatically.

`findAll` and offset pagination use `created_at`, then `createdAt`, for descending ordering when present. Otherwise no default ordering is applied.

## Transaction variants

`createTx` and `updateTx` wrap the corresponding method with `createTransactionVariant`. Pass `dbx` explicitly when a transaction is required. The wrapper calls `dbx.transaction(...)` when the supplied handle exposes it. A Drizzle transaction can expose the same method for a nested transaction or savepoint. Other handles are passed directly to the operation. Omitting `dbx` does not automatically start a transaction from the model’s configured `db`.

An Err from a transaction-wrapped operation is thrown as an Error to trigger rollback. This is a rejection boundary, not a guaranteed Result return. Guard the entire call with `safeTry` when needed. See the [data access overview](/guide/internals/db/) before composing multi-write workflows.

## Extend ordinary behavior

The returned object exposes `table` and `schemas.insert/update/select`. Use these with your chosen Drizzle client for joins, reports and application-specific queries. Keep those functions in the same domain’s model/repository module so the team can find them.

Queries pass through `utils.dbTry`, which keeps bounded driver cause metadata in diagnostics and returns a safe failure with a log reference when available. Model query and validation failures use `utils.handleError`, which resolves the current logger and returns an Err with its log reference. Configure a logger or supply an application policy for failures. The helper throws when required logging/database configuration is missing.

## Keep the action focused

Let actions validate their API input, enforce access policy and call a model function. Return or deliberately shape its Result rather than hiding failure branches. That keeps the operation readable as the service grows.

Continue with [application structure](/guide/start/application-structure), [context](/guide/basics/context) and [errors and Results](/guide/basics/errors-and-results).
