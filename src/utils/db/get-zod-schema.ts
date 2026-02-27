import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-zod";
import type { TableSchemas } from "./types";

/**
 * Generates Zod schemas (insert, update, select) from a Drizzle table.
 *
 * @param table - The Drizzle table definition
 * @returns Object containing insert, update, and select Zod schemas
 *
 * @example
 * ```typescript
 * import { getZodSchema } from '@nilejs/nile';
 * import { companies } from './schema';
 *
 * const schemas = getZodSchema(companies);
 * const insert = schemas.insert.parse(data);
 * const update = schemas.update.partial().parse(data);
 * ```
 */
export function getZodSchema<TTable extends object>(
  table: TTable
): TableSchemas<TTable> {
  const isRelation =
    Object.hasOwn(table as object, "config") &&
    Object.hasOwn(table as object, "table");

  if (isRelation) {
    throw new Error(
      `${String(table)} is a relation schema, not a table schema`
    );
  }

  const insertSchema = createInsertSchema(
    table as unknown as Parameters<typeof createInsertSchema>[0]
  );
  const updateSchema = createUpdateSchema(
    table as unknown as Parameters<typeof createUpdateSchema>[0]
  );
  const selectSchema = createSelectSchema(
    table as unknown as Parameters<typeof createSelectSchema>[0]
  );

  return {
    insert: insertSchema,
    update: updateSchema,
    select: selectSchema,
  } as TableSchemas<TTable>;
}
