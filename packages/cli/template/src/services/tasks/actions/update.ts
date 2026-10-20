import { type Action, createAction } from "@nilejs/nile";
import { Err, Ok } from "slang-ts";
import z from "zod";
import { taskModel } from "@/db/models";

const updateTaskSchema = z.object({
  id: z.string().min(1, "Task ID is required"),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(["pending", "in-progress", "done"]).optional(),
});

const updateTaskHandler = async (data: Record<string, unknown>) => {
  const { id, ...updates } = data;

  const result = await taskModel.update({
    id: id as string,
    data: updates,
  });
  if (result.isErr) {
    return Err(result.error);
  }
  return Ok({ task: result.value });
};

export const updateTaskAction: Action = createAction({
  name: "update",
  description: "Update an existing task",
  handler: updateTaskHandler,
  validation: updateTaskSchema,
});
