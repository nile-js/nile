import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
// biome-ignore lint/performance/noNamespaceImport: Drizzle requires namespace import to pass all table schemas
import * as schema from "./schema";

/** Resolve data directory relative to project root (where bun run is invoked) */
const DATA_DIR = `${process.cwd()}/data`;

/** Ensure data directory exists for PGLite file-based persistence */
Bun.spawnSync(["mkdir", "-p", DATA_DIR]);

/** PGLite instance with file-based persistence */
export const pglite = new PGlite(DATA_DIR);

/** Drizzle ORM instance wrapping PGLite, with schema for relational queries */
export const db = drizzle(pglite, { schema });
