import { createAction } from "@nilejs/nile";
import { Ok } from "@nilejs/nile/fp";
import z from "zod";
import { taskModel } from "@/db/models";

const updateTaskSchema = z.object({
  id: z.string().min(1, "Task ID is required"),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(["pending", "in-progress", "done"]).optional(),
});

type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

const updateTaskHandler = async (data: UpdateTaskInput) => {
  // Fields left out of the request stay undefined and are not changed.
  const result = await taskModel.update({
    id: data.id,
    data: {
      title: data.title,
      description: data.description,
      status: data.status,
    },
  });

  if (result.isErr) {
    return result;
  }

  return Ok({ task: result.value });
};

export const updateTaskAction = createAction({
  name: "update",
  description: "Update an existing task",
  validation: updateTaskSchema,
  handler: updateTaskHandler,
});
