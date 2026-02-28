import { type Action, createAction } from "@nilejs/nile";
import { Err, Ok } from "slang-ts";
import z from "zod";
import { taskModel } from "@/db/models";

const deleteTaskSchema = z.object({
  id: z.string().min(1, "Task ID is required"),
});

const deleteTaskHandler = async (data: Record<string, unknown>) => {
  const result = await taskModel.delete(data.id as string);
  if (result.isErr) {
    return Err(result.error);
  }
  return Ok({ deleted: true, id: data.id });
};

export const deleteTaskAction: Action = createAction({
  name: "delete",
  description: "Delete a task by ID",
  handler: deleteTaskHandler,
  validation: deleteTaskSchema,
});
