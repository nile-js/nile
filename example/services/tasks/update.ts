import { Err, Ok } from "slang-ts";
import z from "zod";
import { type Action, createAction } from "../../../dist/index.js";
import { type Task, tasks } from "./store.js";

const updateTaskSchema = z.object({
  id: z.string().min(1, "Task ID is required"),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(["pending", "in-progress", "done"]).optional(),
});

const updateTaskHandler = (data: Record<string, unknown>) => {
  const task = tasks.get(data.id as string);
  if (!task) {
    return Err(`Task '${data.id}' not found`);
  }

  if (data.title) {
    task.title = data.title as string;
  }
  if (data.description !== undefined) {
    task.description = data.description as string;
  }
  if (data.status) {
    task.status = data.status as Task["status"];
  }

  return Ok({ task });
};

export const updateTaskAction: Action = createAction({
  name: "update",
  description: "Update an existing task",
  handler: updateTaskHandler,
  validation: updateTaskSchema,
  hooks: {
    before: [{ service: "tasks", action: "get", isCritical: true }],
  },
});
