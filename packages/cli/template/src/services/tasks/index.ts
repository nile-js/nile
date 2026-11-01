import { createService } from "@nilejs/nile";
import { createTaskAction } from "./actions/create";
import { deleteTaskAction } from "./actions/delete";
import { getTaskAction } from "./actions/get";
import { listTaskAction } from "./actions/list";
import { updateTaskAction } from "./actions/update";

export const tasksService = createService({
  name: "tasks",
  description: "Task management with CRUD operations",
  actions: [
    createTaskAction,
    listTaskAction,
    getTaskAction,
    updateTaskAction,
    deleteTaskAction,
  ],
});
