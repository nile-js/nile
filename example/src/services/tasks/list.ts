import { type Action, createAction } from "@nilejs/nile";
import { Err, Ok } from "slang-ts";
import { getAllTasks } from "@/db/models";

const listTasksHandler = async () => {
  const result = await getAllTasks();
  if (result.isErr) {
    return Err(result.error);
  }
  return Ok({ tasks: result.value });
};

export const listTaskAction: Action = createAction({
  name: "list",
  description: "List all tasks",
  handler: listTasksHandler,
});
