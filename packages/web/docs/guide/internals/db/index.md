---
title: "Data access"
description: "Keep data access in application models and use the optional Drizzle helpers"
---

Keep data access in model functions. An action validates data and applies policy, then calls a model or domain function. Choose the database and transaction conventions your application needs.

The [application structure guide](/guide/start/application-structure) shows how these modules fit together as the operation count grows.

## Bring your application’s data resource

Create and configure a database client with your chosen library. Pass the existing client through `resources.database` if handlers or models should resolve it from Nile context. Connections, credentials, migrations, indexes and deployment stay in your application.

You can instead pass dependencies to your functions as parameters, so a repository calls no Nile API at all.

## Optional Drizzle helpers

Access the Drizzle helpers through `import { utils } from "@nilejs/nile"`:

| Helper | Purpose |
| --- | --- |
| `utils.createModel` | Basic CRUD methods, validation and pagination around a table. |
| `utils.getZodSchema` | Insert, update and select Zod schemas from a real Drizzle table. |
| `utils.createTransactionVariant` | Run a Result-returning function with explicit transaction/rollback behavior. |
| `DBX<TDB>`, `DBParams<TDB>` | Describe a database or transaction dependency. |
| `utils.handleError` | Log an investigable failure and return an Err. |

Install and configure Drizzle and its driver in your application before using these helpers. The helpers create no database and run no migrations.

## What stays in your application

Write your own functions for joins, reports, rules spanning several models and external integrations. `createModel` exposes its table and schemas so those functions stay in step with the table.

For multi-step writes, decide which writes share a transaction. Calling several actions or adding an after hook runs them separately. A failed notification may be acceptable; a half-applied payment is not. Make that decision in the operation itself.

## Failures and transactions

Expected missing data can return `Err`. Wrap driver calls in `safeTry` and handle the failure for the operation. `handleError` needs a configured or explicit logger and throws without one. A missing database configuration fails too.

`createTransactionVariant` deliberately throws when the wrapped function returns an Err so a database transaction can roll back. The rejection stays a rejection, so wrap the whole transaction call in `safeTry` when the caller needs a Result. If no `dbx` is supplied, the wrapper calls the function without starting a transaction and still throws on Err. Supply a root database with a `transaction` method when a new transaction is required; an existing Drizzle transaction can create a nested transaction or savepoint when it exposes the same method.

See [createModel](/guide/internals/db/create-model) for each method's behavior, and [errors and Results](/guide/basics/errors-and-results) for application error handling.
