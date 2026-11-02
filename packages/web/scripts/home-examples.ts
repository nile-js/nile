/** One checked-in source for highlighted examples, copy text and executable verification. */
export const sourceExamples = {
	action: {
		file: "services/projects/actions/create-project.ts",
		language: "typescript",
		raw: `import { createAction } from "@nilejs/nile";
import { Ok } from "@nilejs/nile/fp";
import { z } from "zod";

const createProjectSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
});

type CreateProjectInput = z.infer<typeof createProjectSchema>;

const createProjectHandler = (data: CreateProjectInput) => {
  const project = {
    id: crypto.randomUUID(),
    name: data.name,
  };

  return Ok({ project: project });
};

export const createProject = createAction({
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
import { services } from "./services/services.config";

const server = await createNileServer({
  serverName: "Team workspace",
  runtime: "bun",
  native: true,
  services: services,
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
	resultBackend: {
		file: "services/orders/actions/quote.ts",
		language: "typescript",
		side: "Backend",
		lines: { err: [16, 20], ok: [23] },
		raw: `import { createAction } from "@nilejs/nile";
import { Err, Ok } from "@nilejs/nile/fp";
import { z } from "zod";
import { productModel } from "@/db/models";

const quoteSchema = z.object({
  id: z.string().min(1),
  quantity: z.number().int().positive(),
});

type QuoteData = z.infer<typeof quoteSchema>;

const quoteHandler = async (data: QuoteData) => {
  const product = await productModel.findById(data.id);
  if (product.isErr) {
    return Err("Product not found");
  }

  if (product.value.stock < data.quantity) {
    return Err("Not enough stock");
  }

  return Ok({ total: product.value.price * data.quantity });
};

export const quoteAction = createAction({
  name: "quote",
  description: "Quote a product order",
  validation: quoteSchema,
  handler: quoteHandler,
});`,
	},
	resultFrontend: {
		file: "components/quote.tsx",
		language: "tsx",
		side: "Frontend",
		lines: { err: [7, 8, 9, 10], ok: [12] },
		raw: `const result = await nile.invoke({
  service: "orders",
  action: "quote",
  payload: { id, quantity },
});

if (result.isErr) {
  showError(result.error);
  return;
}

showTotal(result.value.total);`,
	},
	exploreRequest: {
		file: "POST /api/services",
		language: "json",
		side: "Agent",
		raw: `{
  "intent": "explore",
  "service": "projects",
  "action": "*",
  "payload": { "discoverySecret": "dev-secret" }
}`,
	},
	exploreResponse: {
		file: "200 OK",
		language: "json",
		tone: "ok",
		raw: `{
  "status": true,
  "message": "Actions for 'projects'",
  "data": {
    "actions": [
      {
        "name": "create",
        "description": "Create a project",
        "isProtected": false,
        "validation": true,
        "accessControl": []
      }
    ]
  }
}`,
	},
	schemaRequest: {
		file: "POST /api/services",
		language: "json",
		side: "Agent",
		raw: `{
  "intent": "schema",
  "service": "projects",
  "action": "create",
  "payload": { "discoverySecret": "dev-secret" }
}`,
	},
	schemaResponse: {
		file: "200 OK",
		language: "json",
		tone: "ok",
		raw: `{
  "status": true,
  "message": "Schema for 'projects.create'",
  "data": {
    "create": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "name": { "type": "string", "minLength": 1 }
      },
      "required": ["name"],
      "additionalProperties": false
    }
  }
}`,
	},
	executeRequest: {
		file: "POST /api/services",
		language: "json",
		side: "Frontend",
		raw: `{
  "intent": "execute",
  "service": "projects",
  "action": "create",
  "payload": { "name": "Customer portal" }
}`,
	},
	executeResponse: {
		file: "200 OK",
		language: "json",
		tone: "ok",
		raw: `{
  "status": true,
  "message": "Action completed.",
  "data": {
    "project": {
      "id": "p_42",
      "name": "Customer portal"
    }
  }
}`,
	},
	agentRequest: {
		file: "POST /api/services",
		language: "json",
		side: "Agent",
		raw: `{
  "intent": "execute",
  "service": "projects",
  "action": "create",
  "payload": { "name": "" }
}`,
	},
	agentResponse: {
		file: "400 Bad Request",
		language: "json",
		tone: "err",
		raw: `{
  "status": false,
  "message": "✖ Name is required\\n  → at name",
  "data": {
    "errorCode": "jN8sQ4tV2pLm",
    "issues": [
      { "path": "name", "message": "Name is required" }
    ]
  }
}`,
	},
	slang: {
		file: "modules/load-settings.ts",
		language: "typescript",
		raw: `import { Err, Ok, match, option, safeTry } from "@nilejs/nile/fp";

const port = match(option(process.env.PORT), {
  Some: (presentPort) => {
    return Number(presentPort.value);
  },
  None: () => {
    return 8000;
  },
});

export const loadSettings = async (path: string) => {
  const file = await safeTry(() => Bun.file(path).json());
  if (file.isErr) {
    return Err(\`Could not read \${path}\`);
  }
  return Ok({ ...file.value, port });
};`,
	},
} as const;

export const installRaw = "bunx @nilejs/cli new my-app";
