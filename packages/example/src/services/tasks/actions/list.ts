import { createAction } from "@nilejs/nile";
import { Ok } from "@nilejs/nile/fp";
import { taskModel } from "@/db/models";

const listTasksHandler = async () => {
  const result = await taskModel.findAll();

  if (result.isErr) {
    return result;
  }

  return Ok({ tasks: result.value });
};

export const listTaskAction = createAction({
  name: "list",
  description: "List all tasks",
  handler: listTasksHandler,
});
