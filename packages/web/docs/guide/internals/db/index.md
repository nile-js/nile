# Data access

Keep business operations easy to follow: an action handles its input and application policy, an ordinary domain function implements the rule, and a model/repository owns data access. This is a useful convention, not a runtime restriction. Nile does not require a particular ORM or database.

The [application structure guide](/guide/start/application-structure) shows how these modules fit together as the operation count grows.

## Bring your application’s data resource

Create and configure a database client with your chosen library. Pass the existing client through `resources.database` if handlers or models should resolve it from Nile context. Connection management, credentials, migrations, indexes and deployment remain application responsibilities.

You can instead pass dependencies directly to your functions. A repository does not need to import Nile merely to be callable from an action.

## Optional Drizzle helpers

Nile exports helpers for applications already using Drizzle:

| Helper | Purpose |
| --- | --- |
| `createModel` | Basic CRUD methods, validation and pagination around a table. |
| `getZodSchema` | Insert, update and select Zod schemas from a real Drizzle table. |
| `createTransactionVariant` | Run a Result-returning function with explicit transaction/rollback behavior. |
| `DBX<TDB>`, `DBParams<TDB>` | Describe a database or transaction dependency. |
| `handleError` | Log an investigable failure and return an Err. |

Install and configure the relevant Drizzle packages/driver in your application before choosing these helpers. They do not provision a database or run migrations.

## What stays in your application

Use ordinary functions for joins, reporting, multi-model business rules and external integrations. `createModel` exposes its table and schemas for extending common CRUD behavior; it is not a complete repository abstraction for every domain.

For multi-step writes, decide transaction boundaries explicitly. Calling several actions or attaching an after hook does not make the work atomic. A noncritical notification failure may be acceptable; a partially applied financial operation may not be. That policy belongs beside the business operation.

## Failure boundaries

Expected missing data can return `Err`. Driver failures should be guarded with `safeTry` and handled according to the operation. `handleError` needs a configured or explicit logger and throws if one is absent. Missing database configuration also fails rather than silently continuing.

`createTransactionVariant` deliberately throws when the wrapped function returns an Err so a database transaction can roll back. It does not convert the rejection back into an Err. Guard the whole transaction call with `safeTry` when the caller needs a Result. If no `dbx` is supplied, the wrapper calls the function without starting a transaction and still throws on Err. Supply a root database with a `transaction` method when a new transaction is required; supplying an existing transaction executes inside that scope.

See [createModel](/guide/internals/db/create-model) for the exact method boundaries, and [errors and Results](/guide/basics/errors-and-results) for application error handling.
