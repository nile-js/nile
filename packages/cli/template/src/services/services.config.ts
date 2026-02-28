import { createServices, type Services } from "@nilejs/nile";
import { createTaskAction } from "./tasks/create";
import { deleteTaskAction } from "./tasks/delete";
import { getTaskAction } from "./tasks/get";
import { listTaskAction } from "./tasks/list";
import { updateTaskAction } from "./tasks/update";

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
