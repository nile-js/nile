import { createAction } from "@nilejs/nile";
import { Ok } from "@nilejs/nile/fp";
import z from "zod";
import { taskModel } from "@/db/models";

const getTaskSchema = z.object({
  id: z.string().min(1, "Task ID is required"),
});

type GetTaskInput = z.infer<typeof getTaskSchema>;

const getTaskHandler = async (data: GetTaskInput) => {
  const result = await taskModel.findById(data.id);

  if (result.isErr) {
    return result;
  }

  return Ok({ task: result.value });
};

export const getTaskAction = createAction({
  name: "get",
  description: "Get a task by ID",
  validation: getTaskSchema,
  handler: getTaskHandler,
});
