import { Ok } from "slang-ts";
import z from "zod";
import { type Action, createAction } from "../../../dist/index.js";
import { getNextId, type Task, tasks } from "./store.js";

const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional().default(""),
  status: z
    .enum(["pending", "in-progress", "done"])
    .optional()
    .default("pending"),
});

const createTaskHandler = (data: Record<string, unknown>) => {
  const id = getNextId();
  const task: Task = {
    id,
    title: data.title as string,
    description: (data.description as string) ?? "",
    status: (data.status as Task["status"]) ?? "pending",
    createdAt: new Date().toISOString(),
  };
  tasks.set(id, task);
  return Ok({ task });
};

export const createTaskAction: Action = createAction({
  name: "create",
  description: "Create a new task",
  handler: createTaskHandler,
  validation: createTaskSchema,
});
