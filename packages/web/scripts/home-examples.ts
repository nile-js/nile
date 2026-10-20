/** One checked-in source for highlighted examples, copy text and executable verification. */
export const sourceExamples = {
	action: {
		file: "services/projects/create-project.ts",
		language: "typescript",
		raw: `import { createAction } from "@nilejs/nile";
import { Ok } from "slang-ts";
import { z } from "zod";

const input = z.object({
  name: z.string().trim().min(1),
});

export const createProject = createAction<
  z.infer<typeof input>
>({
  name: "create",
  description: "Create a project",
  validation: input,
  handler: ({ name }) => Ok({
    project: { id: crypto.randomUUID(), name },
  }),
});`,
	},
	service: {
		file: "services/projects/index.ts",
		language: "typescript",
		raw: `import { createService } from "@nilejs/nile";
import { createProject } from "./create-project";

export const projects = createService({
  name: "projects",
  description: "Organize the team's projects",
  actions: [createProject],
});`,
	},
	server: {
		file: "server.ts",
		language: "typescript",
		raw: `import { createNileServer } from "@nilejs/nile";
import { projects } from "./services/projects";

const server = await createNileServer({
  serverName: "Team workspace",
  runtime: "bun",
  native: true,
  services: [projects],
  rest: {
    baseUrl: "/api",
    allowedOrigins: ["http://localhost:3000"],
  },
});

if (!server.nativeRest) {
  throw new Error("Native adapter unavailable");
}

Bun.serve({ port: 8000, fetch: server.nativeRest.fetch });`,
	},
	client: {
		file: "client.ts",
		language: "typescript",
		raw: `import { createNileClient } from "@nilejs/client";

type Inputs = {
  projects: { create: { name: string } };
};

const api = createNileClient<Inputs>({
  baseUrl: "http://localhost:8000/api",
});

const result = await api.invoke({
  service: "projects",
  action: "create",
  payload: { name: "Customer portal" },
});

if (result.error) {
  console.error(result.error);
} else {
  console.log(result.data);
}`,
	},
} as const;

export const installRaw = "bunx @nilejs/cli new my-app";
