import { type Action, createAction } from "@nilejs/nile";
import { Err, Ok } from "slang-ts";
import z from "zod";
import { taskModel } from "@/db/models";

const getTaskSchema = z.object({
  id: z.string().min(1, "Task ID is required"),
});

const getTaskHandler = async (data: Record<string, unknown>) => {
  const result = await taskModel.findById(data.id as string);
  if (result.isErr) {
    return Err(result.error);
  }
  return Ok({ task: result.value });
};

export const getTaskAction: Action = createAction({
  name: "get",
  description: "Get a task by ID",
  handler: getTaskHandler,
  validation: getTaskSchema,
});
