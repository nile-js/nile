import { createAction } from "@nilejs/nile";
import { Ok } from "@nilejs/nile/fp";
import z from "zod";
import { taskModel } from "@/db/models";

const deleteTaskSchema = z.object({
  id: z.string().min(1, "Task ID is required"),
});

type DeleteTaskInput = z.infer<typeof deleteTaskSchema>;

const deleteTaskHandler = async (data: DeleteTaskInput) => {
  const result = await taskModel.delete(data.id);

  if (result.isErr) {
    return result;
  }

  return Ok({ deleted: true, id: data.id });
};

export const deleteTaskAction = createAction({
  name: "delete",
  description: "Delete a task by ID",
  validation: deleteTaskSchema,
  handler: deleteTaskHandler,
});
