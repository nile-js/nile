import { createAction } from "@nilejs/nile";
import { Err, Ok } from "slang-ts";
import z from "zod";
import { taskModel } from "@/db/models";

const getTaskSchema = z.object({
  id: z.string().min(1, "Task ID is required"),
});

type GetTaskInput = z.infer<typeof getTaskSchema>;

const getTaskHandler = async (input: GetTaskInput) => {
  const result = await taskModel.findById(input.id);

  if (result.isErr) {
    return Err(result.error);
  }

  return Ok({ task: result.value });
};

export const getTaskAction = createAction<GetTaskInput>({
  name: "get",
  description: "Get a task by ID",
  validation: getTaskSchema,
  handler: getTaskHandler,
});
