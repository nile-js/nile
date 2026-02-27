import { Ok } from "slang-ts";
import { type Action, createAction, getContext } from "../../../dist/index.js";
import { tasks } from "./store.js";

interface MyDatabase {
  query: () => Promise<Array<{ id: number; title: string }>>;
}

const listTasksHandler = async () => {
  const context = getContext<MyDatabase>();
  const db = context.resources?.database;

  if (db) {
    const dbTasks = await db.query();
    return Ok({ tasks: dbTasks });
  }

  return Ok({ tasks: Array.from(tasks.values()) });
};

export const listTaskAction: Action = createAction({
  name: "list",
  description: "List all tasks",
  handler: listTasksHandler,
});
