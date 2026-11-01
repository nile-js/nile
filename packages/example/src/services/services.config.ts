import { createServices } from "@nilejs/nile";
import { tasksService } from "./tasks";

export const services = createServices([tasksService]);
