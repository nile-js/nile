import { type Action, createAction } from "@nilejs/nile";
import { Err, Ok } from "slang-ts";
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

const createTaskHandler = async (data: Record<string, unknown>) => {
  const result = await taskModel.create({
    data: {
      title: data.title as string,
      description: (data.description as string) ?? "",
      status: (data.status as "pending" | "in-progress" | "done") ?? "pending",
    },
  });
  if (result.isErr) {
    return Err(result.error);
  }
  return Ok({ task: result.value });
};

export const createTaskAction: Action = createAction({
  name: "create",
  description: "Create a new task",
  handler: createTaskHandler,
  validation: createTaskSchema,
});
