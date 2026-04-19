# Migrating to Nile

**Type:** Guide

This document provides a step-by-step process for migrating an existing REST API to Nile. The migration is a restructuring exercise, not a rewrite.

## 1. Prerequisites

- Your existing backend separates business logic from the routing layer
- You have a working understanding of Nile's service-action model
- You can run both the old and new servers side by side during migration

If your business logic is tightly coupled to your routing layer, extract it first. This is a standard refactoring step that most production backends have already done.

## 2. Migration Strategy

Migrate one service at a time. Do not rewrite the entire backend at once. Run the old and new servers in parallel, routing traffic gradually.

## 3. Step One: Map Existing Endpoints to Services and Actions

List all existing endpoints and group them by domain:

| Existing Endpoint | Service | Action |
|---|---|---|
| `POST /users` | `users` | `create` |
| `GET /users/:id` | `users` | `get` |
| `PUT /users/:id` | `users` | `update` |
| `DELETE /users/:id` | `users` | `delete` |
| `POST /orders/:id/refund` | `orders` | `refund` |
| `GET /orders/:id/status` | `orders` | `getStatus` |

Each row becomes one Nile action. The service groups related actions.

## 4. Step Two: Extract Business Logic into Action Handlers

For each endpoint, move the handler logic into a Nile action. The business logic does not change. Only the wrapper changes.

### Before (Express-style)

```typescript
// routes/users.ts
router.post("/users", async (req, res) => {
  const { name, email } = req.body;
  if (!name) return res.status(400).json({ error: "Name is required" });

  const user = await createUser({ name, email });
  res.json({ user });
});
```

### After (Nile)

```typescript
// services/users/create.ts
import { Ok, Err } from "slang-ts";
import { createAction } from "@nilejs/nile";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});

export const createUserAction = createAction({
  name: "create",
  description: "Create a new user",
  validation: createSchema,
  handler: async (data) => {
    const user = await createUser(data);
    return Ok({ user });
  },
});
```

The business logic (`createUser`) is unchanged. The wrapper changes from Express route handler to Nile action handler. The error handling changes from `res.status(400)` to `Err()`. Validation moves from manual checks to Zod.

## 5. Step Three: Adopt the Result Pattern

Replace `throw` and `res.status()` with `Ok()` and `Err()`. This is the most significant code change in the migration.

### Before

```typescript
router.post("/orders/:id/refund", async (req, res) => {
  try {
    const order = await getOrder(req.params.id);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }
    if (order.status !== "paid") {
      return res.status(400).json({ error: "Order is not paid" });
    }
    const refund = await processRefund(order);
    res.json({ refund });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});
```

### After

```typescript
// services/orders/refund.ts
import { Ok, Err } from "slang-ts";
import { createAction, handleError } from "@nilejs/nile";
import { z } from "zod";

const refundSchema = z.object({
  orderId: z.string(),
  reason: z.string().optional(),
});

export const refundOrderAction = createAction({
  name: "refund",
  description: "Refund a paid order",
  validation: refundSchema,
  handler: async (data) => {
    const order = await getOrder(data.orderId);
    if (!order) return Err("Order not found");
    if (order.status !== "paid") return Err("Order is not paid");

    const refund = await processRefund(order);
    return Ok({ refund });
  },
});
```

The logic is identical. The error signaling changes from HTTP status codes to `Err()` returns. Nile maps these to consistent HTTP responses automatically.

## 6. Step Four: Replace Middleware with Hooks

Global middleware becomes global hooks. Per-route middleware becomes action hooks.

### Before (Express middleware)

```typescript
// Global auth middleware
app.use(authenticate);

// Per-route logging
router.post("/orders", logRequest, createOrderHandler);
```

### After (Nile hooks)

```typescript
const server = await createNileServer({
  services: [/* ... */],
  auth: {
    secret: process.env.JWT_SECRET,
    tokenSource: "header",
  },
  onBeforeActionHandler: async ({ nileContext, action, payload }) => {
    await auditLog(action.name, nileContext.getSession("rest"));
    return Ok(payload);
  },
});
```

Authentication is configured once at the server level. Cross-cutting concerns like logging go in `onBeforeActionHandler`. Per-action pre-processing uses the `hooks.before` array on individual actions.

## 7. Step Five: Update the Client

Replace endpoint-specific client calls with Nile client invocations.

### Before

```typescript
const response = await fetch("/api/users", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "Alice", email: "alice@example.com" }),
});
const data = await response.json();
```

### After

```typescript
const { error, data } = await nile.invoke({
  service: "users",
  action: "create",
  payload: { name: "Alice", email: "alice@example.com" },
});
```

The response shape changes from whatever your old API returned to `{ status, message, data }`. Update your frontend to handle this format.

## 8. Step Six: Migrate Incrementally

Run both servers during the transition. Route traffic one service at a time:

1. Migrate the `users` service. Point `/api/users` traffic to Nile.
2. Verify all user operations work correctly.
3. Migrate the `orders` service. Point `/api/orders` traffic to Nile.
4. Repeat for each service.
5. Remove the old server once all services are migrated.

Use a reverse proxy or API gateway to route traffic based on the service path. This allows rollback at any step.

## 9. What Does Not Change

- **Database layer**: Your models, queries, and migrations remain unchanged.
- **Business logic**: The core logic inside your handlers is copied, not rewritten.
- **External integrations**: Third-party API calls, email services, payment gateways work the same way.
- **Testing strategy**: Unit tests for business logic remain valid. Only integration tests need updating.

## 10. Common Pitfalls

- **Do not rewrite business logic**: Copy it into action handlers. Refactor later if needed.
- **Do not migrate everything at once**: One service at a time. Verify each before moving to the next.
- **Do not skip validation**: Replace manual validation with Zod schemas. This is where Nile adds value.
- **Do not ignore the Result pattern**: `Ok()` and `Err()` are not optional. They are the framework contract.
