import { Ok } from "slang-ts";
import { type Action, createAction } from "../../../dist/index.js";
import { tasks } from "./store.js";

const listTasksHandler = () => {
  return Ok({ tasks: Array.from(tasks.values()) });
};

export const listTaskAction: Action = createAction({
  name: "list",
  description: "List all tasks",
  handler: listTasksHandler,
});
