import { createAction } from "@nilejs/nile";
import { Err, Ok } from "slang-ts";
import z from "zod";
import { taskModel } from "@/db/models";

const deleteTaskSchema = z.object({
  id: z.string().min(1, "Task ID is required"),
});

type DeleteTaskInput = z.infer<typeof deleteTaskSchema>;

const deleteTaskHandler = async (input: DeleteTaskInput) => {
  const result = await taskModel.delete(input.id);

  if (result.isErr) {
    return Err(result.error);
  }

  return Ok({ deleted: true, id: input.id });
};

export const deleteTaskAction = createAction<DeleteTaskInput>({
  name: "delete",
  description: "Delete a task by ID",
  validation: deleteTaskSchema,
  handler: deleteTaskHandler,
});
