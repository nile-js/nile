---
title: "Realtime order updates"
description: "Define a typed order topic, let the server JWT check each socket connection, send from a protected action and receive updates in a client"
---

Send order status changes to socket subscribers in the same organization. Each connection is checked with the same JWT as the protected action that changes the order, and the topic decides who can receive it.

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

Create `src/realtime/topics.ts`. The topic has a data schema, a scope schema and a `canReceive` check. A connection can receive only its own organization's scope:

```ts
import { createTopic, createTopics, type InferTopics } from "@nilejs/nile";
import { z } from "zod";

const orderUpdated = createTopic({
  name: "orders.updated",
  data: z.object({
    orderId: z.string(),
    status: z.enum(["placed", "packed", "shipped"]),
  }),
  scope: z.object({
    organizationId: z.string(),
  }),
  canReceive: ({ scope, user }) => {
    return scope.organizationId === user?.organizationId;
  },
});

export const topics = createTopics([orderUpdated]);

export type Topics = InferTopics<typeof topics>;
```

The topic has no `canSend`, so clients cannot send to it. Only server code sends order updates.

## 5. Let the server check each connection

There is nothing to write for this step. Because the server config in step 9 has `auth`, every socket connection is checked with the same JWT secret as protected actions. The client sends its token in the connection's `auth` object, and the verified `userId` and `organizationId` become the `user` that `canReceive` sees.

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

Create `src/services/orders/actions/set-status.ts`. The action checks that the order belongs to the caller's organization, updates the status and sends to the topic with `getContext({ topics })`:

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
  data: SetStatusInput,
  context?: NileContext
) => {
  const session = context?.getSession("rest");
  if (session === undefined) {
    return Err("Sign in to continue");
  }

  const existing = findOrder(data.orderId);
  if (existing === undefined || existing.organizationId !== session.organizationId) {
    return Err("Order not found");
  }

  const order = updateOrderStatus(data.orderId, data.status);
  if (order === undefined) {
    return Err("Order not found");
  }

  const { socket } = getContext({ topics: topics });
  const sent = await socket.send({
    topic: "orders.updated",
    scope: { organizationId: order.organizationId },
    data: { orderId: order.id, status: order.status },
  });

  if (sent.isErr) {
    return Err(sent.error);
  }

  return Ok({ order: order });
};

export const setStatusAction = createAction({
  name: "set-status",
  description: "Change an order status and notify subscribers",
  isProtected: true,
  validation: setStatusSchema,
  handler: setStatusHandler,
});
```

## 8. Register the service

Create `src/services/orders/index.ts`, then update `src/services/services.config.ts` so the `orders` service is registered:

```ts
// src/services/orders/index.ts
import { createService } from "@nilejs/nile";
import { setStatusAction } from "./actions/set-status";

export const ordersService = createService({
  name: "orders",
  description: "Order status changes",
  actions: [setStatusAction],
});
```

```ts
// src/services/services.config.ts
import { createServices } from "@nilejs/nile";
import { ordersService } from "./orders";
import { tasksService } from "./tasks";

export const services = createServices([tasksService, ordersService]);
```

## 9. Configure the server

Replace `src/index.ts`. It adds the `socket` block with the topics, and serves the HTTP and socket handlers with `Bun.serve`:

```ts
import { createLogger, createNileServer, utils } from "@nilejs/nile";
import { sql } from "drizzle-orm";
import { Ok, safeTry } from "@nilejs/nile/fp";
import { config } from "@/config";
import { db } from "@/db/client";
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
    return utils.handleError({
      message: "Could not prepare the task database.",
      data: utils.describeError(result.raw),
      atFunction: "pushSchema",
      logger: logger,
    });
  }

  return Ok(null);
};

const server = await createNileServer({
  serverName: "my-app",
  runtime: "bun",
  native: true,
  project: { root: process.cwd(), structure: "error" },
  services,
  resources: { logger, database: db },
  auth: { secret: config.jwtSecret, method: "header" },
  socket: {
    topics: topics,
    allowedOrigins: ["http://localhost:5173"],
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
    fn: async (context) => {
      const prepared = await pushSchema();
      if (prepared.isErr) {
        return prepared;
      }
      context.resources?.logger?.info({
        atFunction: "onBoot",
        message: "my-app booted - PGLite schema ready",
      });
      return Ok(null);
    },
  },
});

const socketBun = server.socket?.bun;
if (socketBun === undefined) {
  throw new Error("Bun socket adapter is unavailable");
}

const listener = Bun.serve({
  port: 8000,
  fetch: server.fetch,
  ...socketBun,
});

server.lifecycle.register({
  name: "http-listener",
  stop: () => {
    listener.stop(false);
  },
});

console.log(`\nmy-app listening on http://localhost:${listener.port}\n`);
```

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

## 11. Write the client

Create `client-orders.ts`. It receives `org_7` updates on `nile.socket`, calls `set-status` over HTTP and waits for the live message:

```ts
import { createNileClient } from "@nilejs/client";
import type { Topics } from "./src/realtime/topics";

interface OrderActions {
  orders: {
    "set-status": { orderId: string; status: "placed" | "packed" | "shipped" };
  };
}

const token = process.env.TOKEN ?? "";

const nile = createNileClient<OrderActions, Topics>({
  baseUrl: "http://localhost:8000/api",
  headers: { authorization: `Bearer ${token}` },
  socket: { auth: () => ({ token: token }) },
});

const messageReceived = new Promise<void>((resolve) => {
  const subscribed = nile.socket.receive({
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

const changed = await nile.invoke({
  service: "orders",
  action: "set-status",
  payload: { orderId: "ord_1001", status: "packed" },
});

if (changed.isErr) {
  console.error("invoke failed", changed.error);
} else {
  console.log("invoke ok", JSON.stringify(changed.value));
}

await messageReceived;
nile.socket.close();
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
invoke failed Order not found
```

A client that sends no token connects anonymously. `canReceive` sees no `user` and refuses the subscription, and the protected action refuses the call.

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

- **`Socket connection failed`.** The token is expired or signed with another secret, so the server refused the connection. Sign a new token with the same `.env`.
- **The client connects but receives nothing.** Check that the subscription's `organizationId` matches the token and the order. Watch `subscribe failed` in the output.
- **`Bun socket adapter is unavailable`.** The server did not start with `runtime: "bun"` and `native: true`. Check `src/index.ts`.

## See also

- [WebSockets](/guide/features/websockets) explains each permission check and limit.
- [Sockets and typed messages](/guide/reference/realtime) has the complete contract.
- [Protected profile](/guide/examples/protected-profile) explains the JWT check this example reuses.
