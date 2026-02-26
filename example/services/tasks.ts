import { Err, Ok } from "slang-ts";
import z from "zod";
import type { ActionHandler, Service } from "../../dist/index.js";

// --- In-memory task store ---

interface Task {
  id: string;
  title: string;
  description: string;
  status: "pending" | "in-progress" | "done";
  createdAt: string;
}

const tasks: Map<string, Task> = new Map();
let nextId = 1;

// --- Validation schemas ---

const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional().default(""),
  status: z
    .enum(["pending", "in-progress", "done"])
    .optional()
    .default("pending"),
});

const getTaskSchema = z.object({
  id: z.string().min(1, "Task ID is required"),
});

const updateTaskSchema = z.object({
  id: z.string().min(1, "Task ID is required"),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(["pending", "in-progress", "done"]).optional(),
});

const deleteTaskSchema = z.object({
  id: z.string().min(1, "Task ID is required"),
});

// --- Action handlers ---

const createTask: ActionHandler = (data) => {
  const id = String(nextId++);
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

const listTasks: ActionHandler = () => {
  return Ok({ tasks: Array.from(tasks.values()) });
};

const getTask: ActionHandler = (data) => {
  const task = tasks.get(data.id as string);
  if (!task) {
    return Err(`Task '${data.id}' not found`);
  }
  return Ok({ task });
};

const updateTask: ActionHandler = (data) => {
  const task = tasks.get(data.id as string);
  if (!task) {
    return Err(`Task '${data.id}' not found`);
  }

  if (data.title) {
    task.title = data.title as string;
  }
  if (data.description !== undefined) {
    task.description = data.description as string;
  }
  if (data.status) {
    task.status = data.status as Task["status"];
  }

  return Ok({ task });
};

const deleteTask: ActionHandler = (data) => {
  const existed = tasks.delete(data.id as string);
  if (!existed) {
    return Err(`Task '${data.id}' not found`);
  }
  return Ok({ deleted: true, id: data.id });
};

// --- Service definition ---

export const taskService: Service = {
  name: "tasks",
  description: "Task management with CRUD operations",
  meta: { version: "1.0.0" },
  actions: [
    {
      name: "create",
      description: "Create a new task",
      handler: createTask,
      validation: createTaskSchema,
    },
    {
      name: "list",
      description: "List all tasks",
      handler: listTasks,
    },
    {
      name: "get",
      description: "Get a task by ID",
      handler: getTask,
      validation: getTaskSchema,
    },
    {
      name: "update",
      description: "Update an existing task",
      handler: updateTask,
      validation: updateTaskSchema,
      hooks: {
        // Validate task exists before running update handler
        before: [{ service: "tasks", action: "get", isCritical: true }],
      },
    },
    {
      name: "delete",
      description: "Delete a task by ID",
      handler: deleteTask,
      validation: deleteTaskSchema,
    },
  ],
};
