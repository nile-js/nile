/** One checked-in source for highlighted examples, copy text and executable verification. */
export const sourceExamples = {
	action: {
		file: "services/projects/actions/create-project.ts",
		language: "typescript",
		raw: `import { createAction } from "@nilejs/nile";
import { Ok } from "slang-ts";
import { z } from "zod";

const createProjectSchema = z.object({
  name: z.string().trim().min(1),
});

type CreateProjectInput = z.infer<typeof createProjectSchema>;

const createProjectHandler = (input: CreateProjectInput) => {
  const project = {
    id: crypto.randomUUID(),
    name: input.name,
  };

  return Ok({ project: project });
};

export const createProject = createAction<CreateProjectInput>({
  name: "create",
  description: "Create a project",
  validation: createProjectSchema,
  handler: createProjectHandler,
});`,
	},
	service: {
		file: "services/projects/index.ts",
		language: "typescript",
		raw: `import { createService } from "@nilejs/nile";
import { createProject } from "./actions/create-project";

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
	react: {
		file: "components/create-project-button.tsx",
		language: "tsx",
		raw: `import { createNileClient } from "@nilejs/client";

const nile = createNileClient({
  baseUrl: "http://localhost:8000/api",
});

export function CreateProjectButton() {
  const handleClick = async () => {
    const result = await nile.invoke({
      service: "projects",
      action: "create",
      payload: { name: "Customer portal" },
    });

    if (result.isErr) {
      console.error(result.error);
      return;
    }

    console.log(result.value);
  };

  return <button onClick={handleClick}>Create project</button>;
}`,
	},
} as const;

export const installRaw = "bunx @nilejs/cli new my-app";
