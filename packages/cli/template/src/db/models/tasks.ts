import { createModel } from "@nilejs/nile";
import { db } from "@/db/client";
import { tasks } from "@/db/schema";

/** CRUD model for tasks — auto-validates, handles errors, and supports transactions */
export const taskModel = createModel(tasks, { db, name: "task" });
