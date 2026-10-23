---
title: "Handler context"
description: "Use the second argument of an action handler to read resources, the session, execution details and topic publishing"
---

Every action handler receives two arguments: its validated input and a `NileContext`. Nile Js passes the context on every call, from HTTP, the socket transport, `server.invoke` and scheduled jobs. The type marks it optional so handlers can be called without one in tests, so read its fields with `?.`.

## Signature

```ts
const createOrderHandler = (
  input: CreateOrderInput,
  context?: NileContext<unknown>
) => {
  // ...
};
```

Pass the handler to `createAction` by name, as with any other action:

```ts
export const createOrderAction = createAction<CreateOrderInput>({
  name: "create",
  description: "Create an order",
  validation: createOrderSchema,
  handler: createOrderHandler,
});
```

## Complete example

This action reads the database resource, the signed-in session and the request identifier. It stores a value for its own execution, sends a topic message and returns the result. Each use is marked in the file.

```ts
import {
  createAction,
  createNileServer,
  createServices,
  createTopics,
  getContext,
  type NileContext,
  type NileLogger,
} from "@nilejs/nile";
import { Err, Ok } from "slang-ts";
import { z } from "zod";

type AppDatabase = {
  orders: { findById: (id: string) => Promise<{ id: string; total: number }> };
};

export const topics = createTopics({
  "orders.updated": {
    schema: z.object({
      orderId: z.string(),
      status: z.enum(["reserved", "paid"]),
    }),
    scope: z.object({
      organizationId: z.string(),
    }),
  },
});

const reserveOrderSchema = z.object({
  orderId: z.string().uuid(),
});

type ReserveOrderInput = z.infer<typeof reserveOrderSchema>;

const reserveOrderHandler = async (
  input: ReserveOrderInput,
  context?: NileContext<unknown>
) => {
  const logger: NileLogger | undefined = context?.resources?.logger;
  const session = context?.getSession("rest");
  const requestId = context?.execution?.requestId;

  if (session === undefined) {
    return Err("Sign in to continue");
  }

  const database = getContext<AppDatabase>().resources?.database;
  if (database === undefined) {
    return Err("Order store is not configured");
  }

  logger?.info({
    atFunction: "reserveOrder",
    message: "Reserving order",
    data: {
      orderId: input.orderId,
      requestId: requestId,
      userId: session.userId,
    },
  });

  const order = await database.orders.findById(input.orderId);
  context?.updateHookState("loadedTotal", order.total);
  context?.set("lastReservedOrder", input.orderId);

  const sent = await getContext({ topics: topics }).websocket.send({
    topic: "orders.updated",
    scope: { organizationId: "org_123" },
    data: { orderId: order.id, status: "reserved" },
  });

  if (sent.isErr) {
    return Err(sent.error);
  }

  return Ok({
    orderId: order.id,
    total: order.total,
    loadedTotal: context?.hookContext.state.loadedTotal,
  });
};

const reserveOrderAction = createAction<ReserveOrderInput>({
  name: "reserve",
  description: "Reserve an order for the signed-in user",
  isProtected: true,
  validation: reserveOrderSchema,
  handler: reserveOrderHandler,
});

const services = createServices([
  {
    name: "orders",
    description: "Order operations",
    actions: [reserveOrderAction],
  },
]);

export const server = await createNileServer({
  serverName: "shop",
  services: services,
  websocket: { topics: topics },
  rest: { baseUrl: "/api", allowedOrigins: ["https://shop.example.com"] },
});

export const callAnotherAction = async (
  orderId: string
): Promise<unknown> => {
  const result = await server.invoke({
    service: "orders",
    action: "reserve",
    payload: { orderId: orderId },
  });
  return result;
};
```

The file also defines `callAnotherAction`, which calls a second action through `server.invoke`. `NileContext` has no invoke method. Keep a reference to the server in the module that defines the actions, and call `server.invoke` from a helper like this one.

## The context fields you will use

| Field | What you get | Scope |
| --- | --- | --- |
| `resources?.logger` | The logger you passed to `createNileServer` | Shared by the application |
| `resources?.database` | The database you passed as a resource | Shared by the application |
| `getSession("rest")` | Verified identity from JWT: `userId`, `organizationId` and other claims | One request |
| `execution?.requestId` | Identifier for this execution, also used in logs | One execution |
| `execution?.transport` | `"rest"`, `"rpc"`, `"ws"` or `"cron"` | One execution |
| `execution?.signal` | Cancellation signal for the call | One execution |
| `execution?.clientKey` | Client identity used for rate limits | One execution |
| `updateHookState(key, value)` and `hookContext.state` | Values shared between hooks and the handler | One action execution |
| `set(key, value)` and `get(key)` | Application-wide values | Every request in the process |
| `websocket` | The socket server. Use `getContext({ topics })` for typed sends | Shared by the application |

`context.get("rest")` and `context.get("nativeRest")` return the request object for the transport in use. Prefer `getSession` for identity.

## State for one execution, or shared state

Use `updateHookState` and `hookContext.state` for values that belong to one action call. Nested and concurrent executions each get their own state.

Use `set` and `get` only for values that every request should see, such as a feature flag loaded at boot. A value stored with `set` is visible to every concurrent request in the process and is lost on restart. Never store the current user there.

## Publishing a topic message

`getContext({ topics })` returns the socket server with the topic types from your definition, so `send` checks the message shape at compile time. The `topics` object must be the same one passed to `createNileServer`. See [WebSockets](/guide/features/websockets) for the full setup.

## Limits

- The context is valid for the duration of the call. Do not keep it in a module variable and use it later.
- Outside a request, `getSession` returns `undefined` and session writes do nothing.
- `getContext()` throws if the server has not been created. Call it inside a handler or after startup.

## Common mistakes

- Reading `context.execution.requestId` without `?.`, which fails when the handler is called without a context.
- Using `set` for per-request data.
- Creating a second database connection in each handler instead of using `resources.database`.
- Assuming `context.websocket.send` knows your topic types. Use `getContext({ topics })` for that.

## See also

- [Context](/guide/basics/context) describes the resource and session model in full.
- [Context and logging](/guide/features/context-and-logging) shows the logger in use.
- [Composing hooks](/guide/advanced/composing-hooks) explains state that hooks share with the handler.
