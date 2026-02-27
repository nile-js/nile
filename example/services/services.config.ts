import { createActions, type Services } from "../../dist/index.js";
import { createTaskAction } from "./tasks/create";
import { deleteTaskAction } from "./tasks/delete";
import { getTaskAction } from "./tasks/get";
import { listTaskAction } from "./tasks/list";
import { updateTaskAction } from "./tasks/update";

export const services: Services = [
  {
    name: "tasks",
    description: "Task management with CRUD operations",
    meta: { version: "1.0.0" },
    actions: createActions([
      createTaskAction,
      listTaskAction,
      getTaskAction,
      updateTaskAction,
      deleteTaskAction,
    ]),
  },
  {
    name: "another service",
    description: "Another example service",
    actions: [], // No actions for this example
  },
];
