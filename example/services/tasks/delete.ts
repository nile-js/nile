import { Err, Ok } from "slang-ts";
import z from "zod";
import { type Action, createAction } from "../../../dist/index.js";
import { tasks } from "./store.js";

const deleteTaskSchema = z.object({
  id: z.string().min(1, "Task ID is required"),
});

const deleteTaskHandler = (data: Record<string, unknown>) => {
  const existed = tasks.delete(data.id as string);
  if (!existed) {
    return Err(`Task '${data.id}' not found`);
  }
  return Ok({ deleted: true, id: data.id });
};

export const deleteTaskAction: Action = createAction({
  name: "delete",
  description: "Delete a task by ID",
  handler: deleteTaskHandler,
  validation: deleteTaskSchema,
});
