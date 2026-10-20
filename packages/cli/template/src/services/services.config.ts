import { createServices, type Services } from "@nilejs/nile";
import { createTaskAction } from "./tasks/actions/create";
import { deleteTaskAction } from "./tasks/actions/delete";
import { getTaskAction } from "./tasks/actions/get";
import { listTaskAction } from "./tasks/actions/list";
import { updateTaskAction } from "./tasks/actions/update";

export const services: Services = createServices([
  {
    name: "tasks",
    description: "Task management with CRUD operations",
    meta: { version: "1.0.0" },
    actions: [
      createTaskAction,
      listTaskAction,
      getTaskAction,
      updateTaskAction,
      deleteTaskAction,
    ],
  },
]);
