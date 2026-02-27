# Database Utilities

## Purpose

Provides utilities for integrating with Drizzle ORM, including schema generation and transaction management helpers.

## Constraints

- Requires `drizzle-orm` and `drizzle-zod` as peer dependencies.
- Intended for use with Drizzle-compatible databases (PostgreSQL, SQLite, etc.).

## Key Types

### DBX

```typescript
type DBX<TDB> = TDB | Parameters<Parameters<TDB["transaction"]>[0]>[0];
```

A union type representing either a root database instance or a transaction pointer. Used to type functions that can operate within a transaction or on the root database.

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

Object containing Zod schemas for different database operations.

## Utilities

### getContext

Retreives the shared context with type-safe database access. This is the primary way to access the database from action handlers.

```typescript
import { getContext } from '@nilejs/nile';

const handler = async (data: any) => {
  const db = getContext<MyDatabase>().resources?.database;
  if (!db) return Err("Database not found");

  const results = await db.select().from(users);
  return Ok(results);
}
```

### getZodSchema
...
### createTransactionVariant

Creates a transaction-aware wrapper around a database function. This utility handles transaction logic automatically while maintaining the result pattern.

```typescript
function createTransactionVariant<TParams extends DBParams<TDB>, TData, TDB = unknown>(
  fn: (params: TParams) => Promise<Result<TData, unknown>>
): (params: TParams) => Promise<Result<TData, unknown>>
```

**Behavior:**
...
**Example:**

```typescript
import { createTransactionVariant, type DBX, getContext } from '@nilejs/nile';
import { Ok, Err } from 'slang-ts';

// 1. Define standard DB operation
const createCompany = async ({
  company,
  dbx,
}: {
  company: NewCompany;
  dbx?: DBX<MyDatabase>;
}) => {
  // Use provided dbx or fallback to global db from context
  const db = dbx || getContext<MyDatabase>().resources?.database;
  if (!db) throw new Error("DB not found");

  const result = await db.insert(companies).values(company).returning();
  return Ok(result[0]);
};

// 2. Create transaction-aware variant
const createCompanyTx = createTransactionVariant(createCompany);

// 3. Usage in an action handler
const handler = async (data: any) => {
  const db = getContext<MyDatabase>().resources?.database;
  if (!db) return Err("DB not found");

  // Automatically wraps in db.transaction(...)
  const result = await createCompanyTx({ company: data, dbx: db });
  return result;
};
```

## Failure Modes

- **`getZodSchema`**: Throws if passed a relation schema instead of a table schema.
- **`createTransactionVariant`**: Throws when the wrapped function returns an `Err`. This is intentional to trigger database rollback in transaction contexts.
