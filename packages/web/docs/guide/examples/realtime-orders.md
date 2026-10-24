---
title: "Realtime order updates"
description: "Define typed order topics, verify the JWT on each socket connection, publish from a protected action and receive updates in a client"
---

This example connects a socket client to an order topic. A protected action changes an order's status and publishes the change to subscribers in the same organization. A client from another organization can neither subscribe to that topic nor change the order.

## What you need

- The starter project from the [examples overview](/guide/examples), installed with `bun install`.
- The same token helper and secret setup as [the protected profile example](/guide/examples/protected-profile). The steps below repeat the parts you need.

## 1. Add the packages

```sh
bun add @nilejs/client hono
```

## 2. Add the secret

Create `.env` in the project root:

```text
JWT_SECRET=replace-with-a-random-string-of-at-least-32-characters
```

## 3. Read the secret in one place

Create `src/config.ts`:

```ts
const jwtSecret = process.env.JWT_SECRET;

if (jwtSecret === undefined || jwtSecret.length < 32) {
  throw new Error("JWT_SECRET must be set to at least 32 characters");
}

export const config = {
  jwtSecret: jwtSecret,
};
```

## 4. Define the topic

Create `src/realtime/topics.ts`. The topic has a payload schema and a scope schema. Subscribers match on `organizationId`:

```ts
import { createTopics, type InferTopics } from "@nilejs/nile";
import { z } from "zod";

export const topics = createTopics({
  "orders.updated": {
    schema: z.object({
      orderId: z.string(),
      status: z.enum(["placed", "packed", "shipped"]),
    }),
    scope: z.object({
      organizationId: z.string(),
    }),
  },
});

export type Topics = InferTopics<typeof topics>;
```

## 5. Verify the token on each connection

Create `src/realtime/socket-auth.ts`. The socket client sends its token in the connection's `auth` object. This function runs `verifyJWT` on it and returns the identity and the headers that protected actions need:

```ts
import { type AuthConfig, verifyJWT, type WebSocketIdentity } from "@nilejs/nile";
import { Err, Ok, type Result } from "@nilejs/nile/fp";
import { config } from "@/config";

const jwtConfig: AuthConfig = {
  secret: config.jwtSecret,
  method: "header",
};

/** The socket client sends its token in the connection auth object. */
export const authenticateSocket = async (
  _request: Request,
  auth: Record<string, string>
): Promise<Result<WebSocketIdentity, string>> => {
  const bearer = `Bearer ${auth.token ?? ""}`;
  const headers = new Headers({ authorization: bearer });

  const verified = await verifyJWT({ headers: headers }, jwtConfig);
  if (verified.isErr) {
    return Err(verified.error);
  }

  return Ok({
    session: {
      userId: verified.value.userId,
      organizationId: verified.value.organizationId,
    },
    credentials: { headers: headers },
  });
};
```

## 6. Keep the orders in memory

Create `src/services/orders/store.ts`. It holds one seeded order for `org_7`. A restart resets it, which is fine for this example:

```ts
export type OrderStatus = "placed" | "packed" | "shipped";

export interface Order {
  id: string;
  organizationId: string;
  status: OrderStatus;
}

/** Process-local storage for this example. Restarting the server resets it. */
const orders = new Map<string, Order>([
  ["ord_1001", { id: "ord_1001", organizationId: "org_7", status: "placed" }],
]);

export const findOrder = (orderId: string): Order | undefined => {
  return orders.get(orderId);
};

export const updateOrderStatus = (
  orderId: string,
  status: OrderStatus
): Order | undefined => {
  const existing = orders.get(orderId);
  if (existing === undefined) {
    return undefined;
  }

  const updated: Order = { ...existing, status: status };
  orders.set(orderId, updated);
  return updated;
};
```

## 7. Add the protected status action

Create `src/services/orders/actions/set-status.ts`. The action checks that the order belongs to the caller's organization, updates the status and publishes to the topic with `getContext({ topics })`:

```ts
import { createAction, type NileContext, getContext } from "@nilejs/nile";
import { Err, Ok } from "@nilejs/nile/fp";
import { z } from "zod";
import { topics } from "@/realtime/topics";
import { findOrder, updateOrderStatus } from "@/services/orders/store";

const setStatusSchema = z.object({
  orderId: z.string().min(1, "Order ID is required"),
  status: z.enum(["placed", "packed", "shipped"]),
});

type SetStatusInput = z.infer<typeof setStatusSchema>;

const setStatusHandler = async (
  input: SetStatusInput,
  context?: NileContext<unknown>
) => {
  const session = context?.getSession("rest");
  if (session === undefined) {
    return Err("Sign in to continue");
  }

  const existing = findOrder(input.orderId);
  if (existing === undefined || existing.organizationId !== session.organizationId) {
    return Err("Order not found");
  }

  const order = updateOrderStatus(input.orderId, input.status);
  if (order === undefined) {
    return Err("Order not found");
  }

  const { websocket } = getContext({ topics: topics });
  const sent = await websocket.send({
    topic: "orders.updated",
    scope: { organizationId: order.organizationId },
    data: { orderId: order.id, status: order.status },
  });

  if (sent.isErr) {
    return Err(sent.error);
  }

  return Ok({ order: order });
};

export const setStatusAction = createAction<SetStatusInput>({
  name: "set-status",
  description: "Change an order status and notify subscribers",
  isProtected: true,
  validation: setStatusSchema,
  handler: setStatusHandler,
});
```

## 8. Register the service

Replace `src/services/services.config.ts` so the `orders` service is registered:

```ts
import { createServices, type Services } from "@nilejs/nile";
import { setStatusAction } from "./orders/actions/set-status";
import { createTaskAction } from "./tasks/actions/create";
import { deleteTaskAction } from "./tasks/actions/delete";
import { getTaskAction } from "./tasks/actions/get";
import { listTaskAction } from "./tasks/actions/list";
import { updateTaskAction } from "./tasks/actions/update";

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
  {
    name: "orders",
    description: "Order status changes",
    actions: [setStatusAction],
  },
]);
```

## 9. Configure the server

Replace `src/index.ts`. It adds the `websocket` block, which uses the topics and the policies, and serves the HTTP and socket handlers with `Bun.serve`:

```ts
import { createLogger, createNileServer } from "@nilejs/nile";
import { sql } from "drizzle-orm";
import { Ok, safeTry } from "@nilejs/nile/fp";
import { config } from "@/config";
import { db } from "@/db/client";
import { authenticateSocket } from "@/realtime/socket-auth";
import { topics } from "@/realtime/topics";
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
  auth: { secret: config.jwtSecret, method: "header" },
  websocket: {
    topics: topics,
    allowedOrigins: ["http://localhost:5173"],
    authenticate: authenticateSocket,
    authorizeSubscription: ({ scope, identity }) => {
      return Ok(scope.organizationId === identity.session?.organizationId);
    },
    authorizePublish: () => Ok(false),
  },
  rest: {
    baseUrl: "/api",
    host: "localhost",
    port: 8000,
    allowedOrigins: ["http://localhost:5173"],
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

const websocketBun = server.websocket?.bun;
if (websocketBun === undefined) {
  throw new Error("Bun socket adapter is unavailable");
}

const listener = Bun.serve({
  port: 8000,
  fetch: server.fetch,
  websocket: websocketBun,
  idleTimeout: server.websocket?.idleTimeout,
});

server.lifecycle.register({
  name: "http-listener",
  stop: () => {
    listener.stop(false);
  },
});

console.log(`\nmy-app listening on http://localhost:${listener.port}\n`);
```

`authorizePublish` returns `Ok(false)`, so clients cannot publish to the topic. Only server code sends messages.

## 10. Add the token helper

Create `scripts/issue-token.ts`. Pass an organization ID as the first argument:

```ts
import { sign } from "hono/jwt";
import { config } from "../src/config";

const ONE_HOUR_IN_SECONDS = 60 * 60;

/** Development helper: prints a signed token for an organization. */
const organizationId = process.argv[2] ?? "org_7";
const expiresAt = Math.floor(Date.now() / 1000) + ONE_HOUR_IN_SECONDS;

const token = await sign(
  {
    userId: "user_42",
    organizationId: organizationId,
    exp: expiresAt,
  },
  config.jwtSecret
);

console.log(token);
```

## 11. Write the socket client

Create `client-orders.ts`. It subscribes to `org_7`, calls `set-status` over the same socket connection and waits for the live message:

```ts
import { createNileSocketClient } from "@nilejs/client";
import type { Topics } from "./src/realtime/topics";

interface OrderActions {
  orders: {
    "set-status": { orderId: string; status: "placed" | "packed" | "shipped" };
  };
}

const token = process.env.TOKEN ?? "";

const socket = createNileSocketClient<OrderActions, Topics>({
  baseUrl: "http://localhost:8000",
  auth: () => ({ token: token }),
});

const messageReceived = new Promise<void>((resolve) => {
  const subscribed = socket.receive({
    topic: "orders.updated",
    scope: { organizationId: "org_7" },
    onMessage: (message) => {
      console.log("live update", message.data.orderId, message.data.status);
      resolve();
    },
  });

  void subscribed.then((result) => {
    if (result.isErr) {
      console.error("subscribe failed", result.error);
      resolve();
    }
  });
});

await new Promise<void>((resolve) => {
  setTimeout(resolve, 500);
});

const changed = await socket.invoke({
  service: "orders",
  action: "set-status",
  payload: { orderId: "ord_1001", status: "packed" },
});

if (changed.isErr) {
  console.error("invoke failed", changed.error, changed.details);
} else {
  console.log("invoke ok", JSON.stringify(changed.value));
}

await messageReceived;
socket.close();
```

## 12. Run it

Start the server in one terminal:

```sh
bun run dev
```

In a second terminal, run the client with a token for `org_7`:

```sh
TOKEN=$(bun run scripts/issue-token.ts org_7) bun run client-orders.ts
```

You should see the live message and the invoke result:

```text
live update ord_1001 packed
invoke ok {"order":{"id":"ord_1001","organizationId":"org_7","status":"packed"}}
```

Now run it with a token for `org_8`, which belongs to another organization:

```sh
TOKEN=$(bun run scripts/issue-token.ts org_8) bun run client-orders.ts
```

You should see the subscription refused and the order reported as not found for this organization. No live message arrives:

```text
subscribe failed Topic access denied
invoke failed Order not found null
```

A client that sends no token cannot connect at all. Its socket attempt fails at authentication with `Socket connection failed`.

## 13. Type-check

```sh
./node_modules/.bin/tsc --noEmit
```

You should see no output and exit with status 0.

## Limits in this example

- The order store is a `Map` in this process. A second server instance would have its own orders.
- Subscribers in other processes do not receive messages sent by this one. Connect a shared message bus before you run several replicas.
- The live message is not stored. A client that reconnects should reload the order with a normal action.

## Troubleshooting

- **`Socket connection failed`.** The token is missing, expired or signed with another secret. Sign a new token with the same `.env`.
- **The client connects but receives nothing.** Check that the subscription's `organizationId` matches the token and the order. Watch `subscribe failed` in the output.
- **`Bun socket adapter is unavailable`.** The server did not start with `runtime: "bun"` and `native: true`. Check `src/index.ts`.

## See also

- [WebSockets](/guide/features/websockets) explains each policy and limit.
- [Sockets and typed messages](/guide/reference/realtime) has the complete contract.
- [Protected profile](/guide/examples/protected-profile) explains the JWT check this example reuses.
