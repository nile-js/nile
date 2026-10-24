---
title: "Tasks API in React"
description: "Call the starter's tasks actions from a React component with @nilejs/client, handle failures and allow the Vite origin"
---

This example connects a React task list to the starter's `tasks` service. The component loads tasks, adds a new task through `@nilejs/client` and shows the validation message when the title is empty. You will build it in an existing starter project and check it from the command line, then mount the component in your React app.

## What you need

- The starter project from the [examples overview](/guide/examples), installed with `bun install`.
- A React app that will render the component. A Vite app on port 5173 works with the origin setting below.

## 1. Add the frontend packages

```sh
bun add @nilejs/client react react-dom
bun add -d @types/react @types/react-dom
```

You should see both commands finish with a line such as `installed react@19` and no errors.

## 2. Allow the React app's origin

Browsers block responses from another origin unless the server lists it. Replace `src/index.ts` with this file. It adds `http://localhost:5173` to `rest.allowedOrigins`. Everything else is the starter's setup.

```ts
import { createLogger, createNileServer } from "@nilejs/nile";
import { sql } from "drizzle-orm";
import { Ok, safeTry } from "@nilejs/nile/fp";
import { db } from "@/db/client";
import { services } from "@/services/services.config";

const logger = createLogger("my-app", {
  mode: "dev",
  chunking: "monthly",
});

/** Push schema to PGLite on boot */
const pushSchema = async () => {
  const result = await safeTry(() =>
    db.execute(sql`
      CREATE TABLE IF NOT EXISTS tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)
  );

  if (result.isErr) {
    console.error("[pushSchema] Failed:", result.error);
  }
};

const server = await createNileServer({
  serverName: "my-app",
  runtime: "bun",
  native: true,
  project: { structure: "error" },
  services,
  resources: { logger, database: db },
  rest: {
    baseUrl: "/api",
    host: "localhost",
    port: 8000,
    allowedOrigins: ["http://localhost:8000", "http://localhost:5173"],
    enableStatus: true,
    discovery: { enabled: true },
  },
  onBoot: {
    // The first PGlite start on a slow machine can take longer than the 10 second default.
    maxWaitTime: 30_000,
    fn: async (ctx) => {
      await pushSchema();
      ctx.resources?.logger?.info({
        atFunction: "onBoot",
        message: "my-app booted - PGLite schema ready",
      });
      return Ok(null);
    },
  },
});

// Register custom middleware (runs before all service requests)
server.nativeRest?.addMiddleware("/api", async (c, next) => {
  const start = performance.now();
  await next();
  const ms = (performance.now() - start).toFixed(1);
  logger.info({
    atFunction: "requestLog",
    message: `${c.request.method} ${c.path} - ${ms}ms`,
  });
  return undefined;
});

if (server.nativeRest) {
  const port = server.config.rest?.port ?? 8000;
  Bun.serve({ port, fetch: server.nativeRest.fetch });
  console.log(`\nmy-app listening on http://localhost:${port}\n`);
}
```

## 3. Let TypeScript check the React files

Replace `tsconfig.json` so the compiler reads `.tsx` files and uses the React JSX transform:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": ".",
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["./src/**/*.ts", "./src/**/*.tsx", "./client-check.ts", "./drizzle.config.ts"],
  "exclude": ["node_modules", "dist", "data"]
}
```

## 4. Write the typed client

Create `src/web/nile-client.ts`. The payload map gives each action a type, and the zod schemas check the response before the component uses it:

```ts
import { createNileClient } from "@nilejs/client";
import { Err, Ok, type Result } from "@nilejs/nile/fp";
import { z } from "zod";

export interface TaskPayloads {
  tasks: {
    list: Record<string, never>;
    create: { title: string; description?: string };
    complete: { id: string };
  };
}

export const taskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  status: z.enum(["pending", "in-progress", "done"]),
  created_at: z.string(),
  updated_at: z.string(),
});

export type Task = z.infer<typeof taskSchema>;

const taskListSchema = z.object({
  tasks: z.array(taskSchema),
});

const taskResponseSchema = z.object({
  task: taskSchema,
});

export const nile = createNileClient<TaskPayloads>({
  baseUrl: "http://localhost:8000/api",
});

export const loadTasks = async (): Promise<Result<Task[], string>> => {
  const listed = await nile.invoke({
    service: "tasks",
    action: "list",
    payload: {},
  });

  if (listed.isErr) {
    return Err(listed.error);
  }

  const parsed = taskListSchema.safeParse(listed.value);
  if (!parsed.success) {
    return Err("Unexpected response from tasks.list");
  }

  return Ok(parsed.data.tasks);
};

export const createTask = async (
  title: string
): Promise<Result<Task, string>> => {
  const created = await nile.invoke({
    service: "tasks",
    action: "create",
    payload: { title: title },
  });

  if (created.isErr) {
    return Err(created.error);
  }

  const parsed = taskResponseSchema.safeParse(created.value);
  if (!parsed.success) {
    return Err("Unexpected response from tasks.create");
  }

  return Ok(parsed.data.task);
};
```

Each function returns a Result from `@nilejs/nile/fp`. Callers check `isErr` first, then read `value`.

## 5. Write the component

Create `src/web/task-board.tsx`. It loads tasks once, submits the form through `createTask` and shows any failure in a status line:

```tsx
import { type FormEvent, type ReactElement, useEffect, useState } from "react";
import { createTask, loadTasks, type Task } from "./nile-client";

export const TaskBoard = (): ReactElement => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState<string>("");
  const [message, setMessage] = useState<string>("Loading tasks...");

  useEffect(() => {
    const load = async (): Promise<void> => {
      const loaded = await loadTasks();
      if (loaded.isErr) {
        setMessage(loaded.error);
        return;
      }
      setTasks(loaded.value);
      setMessage("");
    };

    void load();
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const created = await createTask(title);
    if (created.isErr) {
      setMessage(created.error);
      return;
    }
    setTasks((current: Task[]) => [...current, created.value]);
    setTitle("");
    setMessage("");
  };

  return (
    <main>
      <h1>Tasks</h1>
      <form
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          void handleSubmit(event);
        }}
      >
        <label htmlFor="task-title">Title</label>
        <input
          id="task-title"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
          }}
        />
        <button type="submit">Add task</button>
      </form>
      {message === "" ? null : <p role="status">{message}</p>}
      <ul>
        {tasks.map((task: Task) => (
          <li key={task.id}>
            {task.title} ({task.status})
          </li>
        ))}
      </ul>
    </main>
  );
};
```

Mount it from the entry point of your React app, for example:

```tsx
import { createRoot } from "react-dom/client";
import { TaskBoard } from "./web/task-board";

createRoot(document.getElementById("root") as HTMLElement).render(<TaskBoard />);
```

## 6. Check the calls from the command line

Create `client-check.ts` in the project root. It runs the same functions the component uses, without a browser:

```ts
import { createTask, loadTasks } from "./src/web/nile-client";

const runClientCheck = async (): Promise<void> => {
  const created = await createTask("Written from the React example");
  if (created.isErr) {
    console.error(created.error);
    return;
  }
  console.log("created", created.value.id, created.value.status);

  const listed = await loadTasks();
  if (listed.isErr) {
    console.error(listed.error);
    return;
  }
  console.log("listed", listed.value.length, "tasks");

  const rejected = await createTask("");
  console.log("empty title rejected", rejected.isErr, rejected.isErr ? rejected.error : "");
};

await runClientCheck();
```

Start the server in one terminal:

```sh
bun run dev
```

In a second terminal, run the check:

```sh
bun run client-check.ts
```

You should see something like this. IDs and the task count change between runs:

```text
created 3f5ac4b5-d128-4dd4-812e-7805a8640909 pending
listed 2 tasks
empty title rejected true Validation failed: ✖ Title is required
  → at title
```

The last line proves the server's validation reached the client. Because the client returns `isErr`, the component can show the message without catching an exception.

## 7. Check the types and the server render

```sh
./node_modules/.bin/tsc --noEmit
```

You should see no output and the command exits with status 0.

To confirm that the component renders on the server without a browser, create `render-check.tsx` with this content and run it with Bun:

```tsx
import { renderToString } from "react-dom/server";
import { TaskBoard } from "./src/web/task-board";

console.log(renderToString(<TaskBoard />));
```

```sh
bun run render-check.tsx
```

You should see the first render, before the effect loads tasks:

```text
<main><h1>Tasks</h1><form><label for="task-title">Title</label><input id="task-title" value=""/><button type="submit">Add task</button></form><p role="status">Loading tasks...</p><ul></ul></main>
```

In the browser, the same component loads the list when it mounts. This guide checked the client and the render on the server; check the browser step in your own app.

## Troubleshooting

- **`No 'Access-Control-Allow-Origin' header` in the browser.** The React app's origin is missing from `rest.allowedOrigins`. Add it, save `src/index.ts`, and reload.
- **The list shows `Loading tasks...` forever.** The server is not running, or `baseUrl` points at another port. Check the terminal running `bun run dev`.
- **`Unexpected response from tasks.list`.** The response shape changed. Compare it with the `taskSchema` in `nile-client.ts`.

## See also

- [Frontend client](/guide/basics/client) explains request options and the Result shape.
- [Errors and Results](/guide/basics/errors-and-results) covers the three response shapes.
- [Validation and errors](/guide/features/validation-and-errors) explains the `details.issues` field for forms.
