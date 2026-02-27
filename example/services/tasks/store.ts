export interface Task {
  id: string;
  title: string;
  description: string;
  status: "pending" | "in-progress" | "done";
  createdAt: string;
}

export const tasks: Map<string, Task> = new Map();
export let nextId = 1;

export const getNextId = () => String(nextId++);
