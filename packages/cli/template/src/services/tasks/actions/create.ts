import { createAction } from "@nilejs/nile";
import { Err, Ok } from "@nilejs/nile/fp";
import z from "zod";
import { taskModel } from "@/db/models";

const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional().default(""),
  status: z
    .enum(["pending", "in-progress", "done"])
    .optional()
    .default("pending"),
});

type CreateTaskInput = z.infer<typeof createTaskSchema>;

const createTaskHandler = async (input: CreateTaskInput) => {
  const result = await taskModel.create({
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

export const createTaskAction = createAction<CreateTaskInput>({
  name: "create",
  description: "Create a new task",
  validation: createTaskSchema,
  handler: createTaskHandler,
});
