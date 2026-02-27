import { Err, Ok } from "slang-ts";
import z from "zod";
import { type Action, createAction } from "../../../dist/index.js";
import { tasks } from "./store.js";

const getTaskSchema = z.object({
  id: z.string().min(1, "Task ID is required"),
});

const getTaskHandler = (data: Record<string, unknown>) => {
  const task = tasks.get(data.id as string);
  if (!task) {
    return Err(`Task '${data.id}' not found`);
  }
  return Ok({ task });
};

export const getTaskAction: Action = createAction({
  name: "get",
  description: "Get a task by ID",
  handler: getTaskHandler,
  validation: getTaskSchema,
});
