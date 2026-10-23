import { createAction } from "@nilejs/nile";
import { Err, Ok } from "slang-ts";
import z from "zod";
import { taskModel } from "@/db/models";

const updateTaskSchema = z.object({
  id: z.string().min(1, "Task ID is required"),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(["pending", "in-progress", "done"]).optional(),
});

type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

const updateTaskHandler = async (input: UpdateTaskInput) => {
  // Fields left out of the request stay undefined and are not changed.
  const result = await taskModel.update({
    id: input.id,
    data: {
      title: input.title,
      description: input.description,
      status: input.status,
    },
  });

  if (result.isErr) {
    return Err(result.error);
  }

  return Ok({ task: result.value });
};

export const updateTaskAction = createAction<UpdateTaskInput>({
  name: "update",
  description: "Update an existing task",
  validation: updateTaskSchema,
  handler: updateTaskHandler,
});
