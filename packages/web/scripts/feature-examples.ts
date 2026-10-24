/** Small, explicit examples; application imports remain the application's own code. */
export const featureExamples = {
	results: {
		file: "actions/rename-project.ts",
		language: "typescript",
		raw: `import { Err, Ok } from "@nilejs/nile/fp";
import { z } from "zod";

const renameSchema = z.object({
  name: z.string().min(1),
});

type RenameInput = z.infer<typeof renameSchema>;

const renameHandler = (input: RenameInput) => {
  if (input.name === "system") {
    return Err("Choose a different name");
  }

  return Ok({ name: input.name });
};`,
	},
	policies: {
		file: "server/access.ts",
		language: "typescript",
		raw: `import { createNileServer } from "@nilejs/nile";
import type { BeforeActionHandler } from "@nilejs/nile";
import { Err, Ok } from "@nilejs/nile/fp";

type AccessHook = BeforeActionHandler<unknown, string>;

const requireSession: AccessHook = (params) => {
  const session = params.nileContext.getSession("rest");

  if (params.action.isProtected && session === undefined) {
    return Err("Sign in to continue");
  }

  return Ok(params.payload);
};

const server = await createNileServer({
  serverName: "Workspace",
  services: services,
  auth: { secret: config.jwtSecret, method: "header" },
  onBeforeActionHandler: requireSession,
});`,
	},
	context: {
		file: "modules/log-project.ts",
		language: "typescript",
		raw: `import { getContext } from "@nilejs/nile";

const logProjectCreated = (projectId: string) => {
  const context = getContext();
  const logger = context.resources?.logger;

  if (logger === undefined) {
    return;
  }

  logger.info({
    atFunction: "logProjectCreated",
    message: "Project created",
    data: { projectId: projectId },
  });
};`,
	},
	sockets: {
		file: "messaging/order-updates.ts",
		language: "typescript",
		raw: `import { createTopics, getContext } from "@nilejs/nile";
import { z } from "zod";

const topics = createTopics({
  "orders.updated": {
    schema: z.object({
      orderId: z.string(),
      status: z.enum(["pending", "paid"]),
    }),
  },
});

const notifyOrderPaid = async (orderId: string) => {
  const context = getContext({ topics: topics });

  return await context.websocket.send({
    topic: "orders.updated",
    data: { orderId: orderId, status: "paid" },
  });
};`,
	},
	schedules: {
		file: "server/schedules.ts",
		language: "typescript",
		raw: `import type { ScheduledJob } from "@nilejs/nile";

const sendWeeklySummary = async () => {
  const summary = await buildSummary();
  await emailTeam(summary);
};

export const weeklySummary: ScheduledJob = {
  name: "weekly-summary",
  schedule: {
    weekly: "monday",
    at: "09:00",
    timezone: "Africa/Kampala",
  },
  handler: sendWeeklySummary,
};`,
	},
	controls: {
		file: "modules/resize-queue.ts",
		language: "typescript",
		raw: `import { utils } from "@nilejs/nile";

const resizeImage = async (imageId: string) => {
  const image = await images.resize(imageId);
  return image.url;
};

const resizeQueue = utils.createQueue({
  task: resizeImage,
  concurrency: 4,
  capacity: 100,
});

const result = await resizeQueue.run("image-42");`,
	},
	quotas: {
		file: "server/quotas.ts",
		language: "typescript",
		raw: `import { utils } from "@nilejs/nile";
import type { ExecutionDetails } from "@nilejs/nile";

const limiter = utils.createRateLimiter({
  strategy: "token-bucket",
  capacity: 20,
  refillPerSecond: 5,
  maxKeys: 10000,
});

const getQuotaKey = (details: ExecutionDetails) => {
  const clientKey = details.context.clientKey;

  if (clientKey === undefined) {
    return "anonymous";
  }

  return clientKey;
};

export const execution = {
  rateLimit: { store: limiter, key: getQuotaKey },
};`,
	},
	telemetry: {
		file: "server/diagnostics.ts",
		language: "typescript",
		raw: `import { createNileTelemetry } from "@nilejs/nile";

const telemetry = await createNileTelemetry({
  serviceName: "shop",
  endpoint: config.otelEndpoint,
});

export const execution = {
  diagnostics: {
    telemetry: telemetry,
    slowMs: 1000,
  },
};`,
	},
	contracts: {
		file: "scripts/export-contracts.ts",
		language: "typescript",
		raw: `import { server } from "../server";

const result = await server.schema({
  path: "./contracts/nile.schemas.json",
});

if (result.isErr) {
  console.error(result.error);
} else {
  console.log("Contracts exported");
}`,
	},
	models: {
		file: "models/projects.ts",
		language: "typescript",
		raw: `import { utils } from "@nilejs/nile";
import { database } from "../db/client";
import { projects } from "../db/schema";

const projectModel = utils.createModel(projects, {
  name: "project",
  db: database,
});

const findProject = async (projectId: string) => {
  return await projectModel.findById(projectId);
};`,
	},
	helpers: {
		file: "modules/check-delivery.ts",
		language: "typescript",
		raw: `import { utils } from "@nilejs/nile";

const checkDelivery = async () => {
  return await courier.getStatus("parcel-42");
};

const result = await utils.retryFnWithJitter({
  fn: checkDelivery,
  maxAttempts: 5,
  onResult: (attempt) => {
    if (attempt.result.isErr) {
      return attempt.retry();
    }

    return attempt.end(attempt.result.value);
  },
});`,
	},
	files: {
		file: "server/files.ts",
		language: "typescript",
		raw: `const fiveMegabytes = 5 * 1024 * 1024;

export const rest = {
  enableStatic: true,
  staticDir: "./assets",
  uploads: {
    enforceContentType: true,
    limits: {
      maxFiles: 3,
      maxFileSize: fiveMegabytes,
    },
    allow: {
      extensions: [".png", ".jpg"],
      mimeTypes: ["image/png", "image/jpeg"],
    },
  },
};`,
	},
	lifecycle: {
		file: "server/shutdown.ts",
		language: "typescript",
		raw: `import { server } from "../server";

const stats = server.stats();
const isReady = server.lifecycle.isReady();

const report = await server.lifecycle.shutdown({
  timeoutMs: 10000,
});

if (report.timedOut) {
  console.error("Shutdown deadline reached");
}`,
	},
	interfaces: {
		file: "modules/create-from-job.ts",
		language: "typescript",
		raw: `import { server } from "../server";

const result = await server.invoke({
  service: "projects",
  action: "create",
  payload: { name: "Customer portal" },
});

if (result.isErr) {
  console.error(result.error);
} else {
  console.log(result.value);
}`,
	},
} as const;
