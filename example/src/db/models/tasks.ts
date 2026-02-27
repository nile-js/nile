import {
  createTransactionVariant,
  type DBX,
  getZodSchema,
  handleError,
} from "@nilejs/nile";
import { count, desc, eq } from "drizzle-orm";
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

export const createTaskTx = createTransactionVariant(createTask);

/** Get a single task by its ID */
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

/** Delete a task by ID, returns the deleted row */
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

/** Get all tasks ordered by newest first */
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

/** Get paginated tasks with total count */
export const getTasksPaginated = async ({
  limit = 100,
  offset = 0,
}: {
  limit?: number;
  offset?: number;
}) => {
  const tasksResult = await safeTry(() => {
    return db
      .select()
      .from(tasks)
      .orderBy(desc(tasks.created_at))
      .limit(limit)
      .offset(offset);
  });
  if (tasksResult.isErr) {
    return handleError({
      message: "Error getting paginated tasks",
      data: { limit, offset, error: tasksResult.error },
      atFunction: "getTasksPaginated",
    });
  }

  const countResult = await safeTry(() => {
    return db.select({ total: count() }).from(tasks);
  });
  if (countResult.isErr) {
    return handleError({
      message: "Error getting tasks count",
      data: { error: countResult.error },
      atFunction: "getTasksPaginated",
    });
  }

  const taskRows = tasksResult.value ?? [];
  const total = countResult.value?.[0]?.total ?? 0;

  return Ok({
    tasks: taskRows,
    total,
    hasMore: offset + taskRows.length < total,
  });
};
