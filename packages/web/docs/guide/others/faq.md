# FAQ

Common questions about building with Nile, with accurate answers that reflect the current state of the framework.

---

## How do I ensure consistent error responses across my API?

Nile has a layered error handling strategy that guarantees every response follows the same shape — no matter what goes wrong.

### Result Pattern at Function Boundaries

Every action handler returns `Ok(data)` for success or `Err("message")` for failure using the `slang-ts` Result type. This is enforced by the type system — handlers cannot return raw values or throw to signal errors.

```typescript
import { Ok, Err } from "slang-ts";
import { createAction, type Action } from "@nilejs/nile";

export const getUser: Action = createAction({
  name: "getUser",
  description: "Get user by ID",
  handler: (data) => {
    if (!data.id) return Err("User ID is required");

    const user = findUser(data.id as string);
    if (!user) return Err("User not found");

    return Ok({ user });
  },
});
```

Both `Ok` and `Err` produce the same consistent response shape at the HTTP boundary:

```json
// Ok path
{ "status": true, "message": "Action 'users.getUser' executed", "data": { "user": { ... } } }

// Err path
{ "status": false, "message": "User not found", "data": {} }
```

### `handleError` for Runtime Errors

For errors that should be logged and traced (database failures, unexpected state, external service errors), use `handleError`. It logs the error via the configured logger and returns an `Err` with a traceable log ID:

```typescript
import { Ok } from "slang-ts";
import { createAction, handleError, type Action } from "@nilejs/nile";

export const createOrder: Action = createAction({
  name: "createOrder",
  description: "Create a new order",
  handler: async (data, context) => {
    const db = context?.resources?.database;
    if (!db) {
      return handleError({ message: "Database not available" });
      // Returns: Err("[log-id-xyz] Database not available")
    }

    const result = await saveOrder(db, data);
    if (!result) {
      return handleError({
        message: "Failed to save order",
        data: { payload: data },
        atFunction: "createOrder",
      });
    }

    return Ok({ order: result });
  },
});
```

`handleError` resolves the logger from context automatically. The returned error string includes the log ID, making it easy to trace issues in production logs.

### Crash Safety

Even if a handler throws an unhandled exception, the engine's `safeTry` wrapper catches it and converts it to `Err(error.message)`. The response shape stays consistent — the client never receives a raw stack trace or 500 error.

### Client Side

The `@nilejs/client` maps server responses to `{ error, data }`. Network failures, timeouts, and server errors all land in the `error` field:

```typescript
const { error, data } = await nile.invoke({
  service: "users",
  action: "getUser",
  payload: { id: "123" },
});

if (error) {
  // error = "User not found" or "[log-id] Database not available"
  showErrorToast(error);
} else {
  renderUser(data);
}
```

**Summary:** Use `Err("message")` for expected business errors. Use `handleError(...)` for runtime errors that need logging. The framework handles the rest — consistent shapes all the way from handler to client.

---

## How do I handle authentication and authorization across multiple services?

Nile has built-in JWT authentication and a hook-based authorization model.

### Server-Level Auth Config

Configure JWT verification once at the server level. Every service and action in your application shares this config:

```typescript
import { createNileServer } from "@nilejs/nile";

const server = createNileServer({
  name: "MyApp",
  services: [/* ... */],
  auth: {
    secret: process.env.JWT_SECRET!,
    method: "header", // or "cookie"
  },
});
```

### Per-Action Protection

Mark individual actions as protected. The engine verifies the JWT before the handler runs — no auth code in your business logic:

```typescript
import { Ok, Err } from "slang-ts";
import { createAction, type Action } from "@nilejs/nile";

// Public — no auth required
export const listProducts: Action = createAction({
  name: "listProducts",
  description: "List all products",
  handler: () => Ok({ products: [] }),
});

// Protected — requires valid JWT
export const createProduct: Action = createAction({
  name: "createProduct",
  description: "Create a product",
  isProtected: true,
  handler: (data, context) => {
    const user = context?.getUser();
    return Ok({ product: { ...data, createdBy: user?.userId } });
  },
});
```

This works the same across every service. A protected action in the `orders` service and a protected action in the `products` service both go through the same JWT verification step.

### Authorization via Hooks

For role-based access control or custom authorization logic, use `onBeforeActionHandler`. This hook runs after JWT verification but before the action handler, giving you the verified user identity:

```typescript
import { Ok, Err } from "slang-ts";

const server = createNileServer({
  name: "MyApp",
  services: [/* ... */],
  auth: { secret: process.env.JWT_SECRET! },
  onBeforeActionHandler: async (request, context) => {
    const user = context.getUser();
    if (!user) return; // Unprotected action, let it through

    const requiredRole = request.action.accessControl?.[0];
    if (requiredRole && user.role !== requiredRole) {
      return Err(`Requires role: ${requiredRole}`);
    }

    return Ok(request.payload);
  },
});
```

Actions declare their required roles via `accessControl`:

```typescript
export const deleteUser: Action = createAction({
  name: "deleteUser",
  description: "Delete a user account",
  isProtected: true,
  accessControl: ["admin"],
  handler: (data, context) => {
    // Only reaches here if JWT is valid AND user has "admin" role
    return Ok({ deleted: true });
  },
});
```

See the full [Authentication guide](/guide/basics/auth) for token sources, JWT claims mapping, and cookie-based auth.

---

## How does Nile handle API routing?

Nile does **not** generate REST endpoints from your service definitions. This is a fundamental architectural difference from frameworks like Express, Fastify, or NestJS.

### Single Endpoint, Intent-Based Routing

All communication flows through one endpoint:

```
POST {baseUrl}/services
```

The request body tells Nile what to do:

```json
{
  "intent": "execute",
  "service": "tasks",
  "action": "create",
  "payload": { "title": "Buy milk" }
}
```

There is no `/tasks/create` route. There is no `GET /tasks/:id`. Every operation — whether it's creating a task, listing users, or checking auth — goes through the same endpoint with a different `intent`, `service`, and `action` combination.

### Why This Is Faster

Traditional endpoint-based frameworks match incoming requests against a route table — often a trie or regex-based router. As your API grows, route matching scales with the number of endpoints.

Nile uses pre-computed O(1) dictionary lookups. The engine builds a nested `Record<serviceName, Record<actionName, Action>>` at boot. Finding the right handler is a two-key object lookup regardless of how many services or actions exist. No route parsing, no regex matching, no middleware stacks per route.

### Three Intents

| Intent | Purpose | Example |
|--------|---------|---------|
| `execute` | Run an action's business logic | Create a task, update a user |
| `explore` | Discover available services and actions | List all services, get action metadata |
| `schema` | Retrieve validation schemas as JSON Schema | Generate client types, build dynamic forms |

### Built-In Discovery

Unlike endpoint-based APIs that need separate documentation (OpenAPI, Swagger), Nile's `explore` intent provides runtime discovery. Any client can query what services and actions are available, what fields they accept, and whether they require authentication — all through the same endpoint.

```typescript
// Client-side discovery
const { data: services } = await nile.explore({ service: "*", action: "*" });
// Returns all services with their actions, descriptions, and metadata
```

### Embrace the Model

If you're coming from endpoint-based frameworks, the mental shift is:
- **Service** = domain grouping (replaces route prefixes like `/users`, `/tasks`)
- **Action** = operation (replaces individual route handlers)
- **Intent** = what you want to do (replaces HTTP verbs)

This model scales cleanly. Adding a new operation means adding an action to a service — no route registration, no middleware configuration, no path conflicts.

---

## How do I handle complex, multi-step workflows?

Nile handles workflow complexity through action composition, hook pipelines, and shared execution state.

### Actions Are Just Functions

Any action can contain arbitrarily complex business logic. There's no artificial constraint on what a handler does:

```typescript
export const processOrder: Action = createAction({
  name: "processOrder",
  description: "Validate, charge, and fulfill an order",
  isProtected: true,
  handler: async (data, context) => {
    // Step 1: Validate inventory
    const inventory = await checkInventory(data.items);
    if (!inventory.available) return Err("Items out of stock");

    // Step 2: Process payment
    const payment = await chargePayment(data.paymentMethod, data.total);
    if (!payment.success) {
      return handleError({ message: "Payment failed", data: { reason: payment.error } });
    }

    // Step 3: Create fulfillment
    const fulfillment = await createFulfillment(data.items, data.shippingAddress);

    return Ok({ orderId: payment.transactionId, fulfillment });
  },
});
```

### Hook Pipelines for Composable Steps

When workflow steps are reusable across actions, define them as separate actions and wire them via hooks. Before hooks run sequentially — each hook's output becomes the next hook's input:

```typescript
// A validation action reused across multiple services
export const validateStock: Action = createAction({
  name: "validateStock",
  description: "Check inventory availability",
  handler: async (data) => {
    const available = await checkStock(data.items);
    if (!available) return Err("Out of stock");
    return Ok(data); // Pass through to next step
  },
});

// The main action with hooks
export const createOrder: Action = createAction({
  name: "createOrder",
  description: "Create an order",
  hooks: {
    before: [
      { service: "inventory", action: "validateStock", isCritical: true },
      { service: "pricing", action: "applyDiscounts", isCritical: true },
    ],
    after: [
      { service: "notifications", action: "sendConfirmation", isCritical: false },
    ],
  },
  handler: (data, context) => {
    // data has been validated and enriched by before hooks
    return Ok({ order: { ...data, status: "confirmed" } });
  },
});
```

The `isCritical` flag controls failure behavior: critical hooks halt the pipeline on error, non-critical hooks log the failure and continue.

### Shared State Within a Pipeline

Hooks within a single execution share state via `hookContext.state`:

```typescript
// In a before hook's action handler
handler: (data, context) => {
  const discount = calculateDiscount(data);
  context?.hookContext?.state.discountApplied = discount;
  return Ok({ ...data, discount });
},

// In the main handler
handler: (data, context) => {
  const discount = context?.hookContext?.state.discountApplied;
  // Use the discount calculated by the before hook
  return Ok({ total: data.subtotal - discount });
},
```

### Cross-Request State

For workflows that span multiple requests (multi-step forms, approval chains), use sessions:

```typescript
handler: (data, context) => {
  // Store progress
  context?.setSession("rest", { step: 2, orderId: data.orderId });

  // Retrieve later
  const session = context?.getSession("rest");
  return Ok({ currentStep: session?.step });
},
```

### Organizing Complex Domains

Services keep workflows modular. Each service groups related micro-actions that each do one thing well. Complex workflows compose these small actions via hooks or orchestrator actions that call domain logic directly:

```
services/
  orders/
    validate-order.ts    # validates order data
    process-payment.ts   # handles payment logic
    create-order.ts      # orchestrates the full flow
    cancel-order.ts      # handles cancellation
  inventory/
    check-stock.ts       # stock availability check
    reserve-items.ts     # temporary hold on items
  notifications/
    send-confirmation.ts # order confirmation email
```

---

## What if the service-action structure doesn't fit my domain?

It does. The service-action model maps directly to domain-driven design, and every backend operation — regardless of complexity — reduces to "which domain?" and "what operation?".

### Think in Domains and Operations

A **service** is a bounded context: users, orders, payments, notifications. An **action** is an operation within that context: create, update, validate, process.

If you find yourself fighting the structure, you're likely thinking in terms of routes or CRUD endpoints. Shift the mental model:

| Traditional Thinking | Nile Thinking |
|---------------------|---------------|
| `POST /orders` | service: `orders`, action: `create` |
| `GET /orders/:id/status` | service: `orders`, action: `getStatus` |
| `POST /orders/:id/refund` | service: `orders`, action: `refund` |
| `POST /checkout` | service: `checkout`, action: `process` |

Every HTTP endpoint you would normally create maps to a service + action pair.

### Coarse and Fine-Grained Actions

Actions can be as granular or as broad as your domain requires. A simple CRUD operation and a complex multi-step workflow are both just actions:

```typescript
// Fine-grained: single responsibility
export const validateEmail: Action = createAction({
  name: "validateEmail",
  description: "Check if email is valid and not taken",
  handler: (data) => { /* focused logic */ },
});

// Coarse-grained: orchestrates multiple steps
export const registerUser: Action = createAction({
  name: "registerUser",
  description: "Full user registration flow",
  handler: async (data) => {
    // Calls validation, creates user, sends welcome email
    // All within one handler — it's just a function
  },
});
```

### Cross-Cutting Concerns

Logic that applies across services (logging, authorization, rate limiting, audit trails) goes in global hooks:

```typescript
const server = createNileServer({
  services: [/* ... */],
  onBeforeActionHandler: async (request, context) => {
    // Runs before every action in every service
    await auditLog(request.service, request.action, context.getUser());
    return Ok(request.payload);
  },
  onAfterActionHandler: async (result, context) => {
    // Runs after every action in every service
    trackMetrics(context.hookContext?.actionName, result.isOk);
    return result;
  },
});
```

### Cross-Service Composition via Hooks

An action in one service can reference actions in another via hooks, without tight coupling:

```typescript
export const createOrder: Action = createAction({
  name: "createOrder",
  hooks: {
    before: [
      { service: "auth", action: "verifyPermissions", isCritical: true },
      { service: "inventory", action: "reserveItems", isCritical: true },
    ],
    after: [
      { service: "notifications", action: "sendOrderEmail", isCritical: false },
    ],
  },
  handler: (data) => Ok({ order: data }),
});
```

The services remain independent. The composition is declared at the action level, not embedded in business logic.

### The Constraint Is the Strength

The service-action structure forces clean domain separation. You cannot create a handler that lives outside a service. You cannot create an operation that isn't an action. This prevents the common patterns that make backends hard to maintain: scattered route handlers, middleware spaghetti, and implicit dependencies between endpoints.

Every operation in your system has a clear address: `service.action`. Every piece of business logic has a defined home. This makes the codebase navigable, testable, and composable by default.

---

## Why not use GraphQL instead?

GraphQL is powerful but introduces a significant learning curve: query syntax, resolvers, dataloaders, schema stitching, and specialized caching strategies. For teams already productive with request/response patterns, that overhead often isn't justified.

Nile keeps the familiar mental model — send a request, get a response — while eliminating the boilerplate of traditional REST. You don't need to learn a new query language or tooling ecosystem. The `explore` and `schema` intents give you the introspection benefits that make GraphQL attractive, without the complexity tax.

If your team is already invested in GraphQL and it's working, keep using it. Nile is for teams that want structured, discoverable APIs without leaving the request/response paradigm.

---

## Why not use tRPC for type safety?

tRPC's type safety is excellent, but it requires a monorepo or complex type-sharing setup. If your frontend and backend live in separate repositories — which is common — tRPC's main advantage disappears while the infrastructure complexity remains.

Nile's approach is different: the `schema` intent exports Zod validation schemas as JSON Schema over the wire. The `@nilejs/client` provides type-safe invocations when you pass generated types as a generic. You get compile-time checking on service names, action names, and payload shapes without coupling your repositories.

```typescript
import { createNileClient } from "@nilejs/client";
import type { ServicePayloads } from "./generated/types";

const nile = createNileClient<ServicePayloads>({ baseUrl: "/api" });

// Full autocomplete and type checking — no monorepo required
await nile.invoke({
  service: "tasks",
  action: "create",
  payload: { title: "Buy milk" },
});
```

---

## Why not stick to pure REST?

Business logic doesn't fit cleanly into HTTP verbs. Operations like `calculateShipping`, `processPayment`, or `generateReport` aren't resource updates — they're actions. Forcing them into PUT/POST/PATCH is artificial and obscures what the operation actually does.

Nile makes operations explicit. `service: "shipping", action: "calculate"` is clearer than `POST /shipping/calculations` and wondering whether it creates a resource or just computes a value. Business clarity over HTTP purity.

For simple CRUD where REST mapping is natural, Nile still works — you just name your actions `create`, `get`, `update`, `delete`. The difference is you're not constrained to that model when your domain outgrows it.

---

## Doesn't using POST for everything violate HTTP semantics?

Yes, and that's a deliberate trade-off. Nile prioritizes consistent patterns and business clarity over HTTP semantic correctness.

For internal APIs where you control both client and server, the benefits of explicit action-based routing outweigh HTTP-level caching. Application-level caching (Redis, in-memory stores, database query optimization) is more appropriate for complex business operations anyway — most enterprise logic involves multiple data sources and calculations that don't cache well at the HTTP transport layer.

The single-endpoint model also simplifies infrastructure: load balancers, API gateways, and proxies only need to handle one route.

---

## How does Nile compare to JSON-RPC and traditional REST?

| Feature | JSON-RPC | Nile | Traditional REST |
|---------|----------|------|-----------------|
| Discovery | External docs | Built-in `explore` intent | HATEOAS (rarely implemented) |
| HTTP Methods | POST only | POST only | Full verb semantics |
| URL Structure | Single endpoint | Single endpoint | Resource-based routes |
| Validation | Manual | Built-in Zod schemas | Manual or OpenAPI |
| Type Safety | Manual | Schema-driven client types | Manual or codegen |
| Error Format | JSON-RPC error codes | Consistent `{ status, message, data }` | Varies per endpoint |

Nile borrows RPC's explicit operations and adds REST-like discoverability. The `explore` intent replaces the need for external API documentation, and `schema` provides machine-readable type information that JSON-RPC doesn't offer.

---

## So is Nile just RPC?

Not exactly. Nile uses RPC-style communication — named operations with typed payloads over a single endpoint — but it's a backend framework, not a protocol.

RPC (JSON-RPC, gRPC, etc.) defines how messages are formatted and transported. Nile defines how you **build and organize** your backend. The RPC-like request format is just the transport interface. Behind it sits a full application framework: an execution engine with O(1) routing, a hook pipeline for composable middleware, built-in JWT authentication, Zod validation, context management, session handling, structured logging, and a typed client SDK.

Calling Nile "RPC" is like calling Express "HTTP" — technically accurate at the transport level, but it misses everything the framework does above that layer.

The better label is **service-action framework**. You define services (domains) and actions (operations). The framework handles everything else: discovery, validation, auth, execution pipelines, error handling, and the consistent response format. The single-POST interface is an implementation detail, not the identity.

---

## How do I handle caching?

An action is just an action — whether it reads or writes is entirely up to you. Caching happens at the layers where it makes sense:

**Client-side:** Tools like React Query (TanStack Query) for React, SWR, or a wrapped fetch with caching logic work perfectly. You cache based on the `service + action + payload` combination as your cache key. Browser-level HTTP caching (ETags, Cache-Control) isn't available since everything is POST, but Nile is primarily used in systems like dashboards and internal tools where that rarely matters.

**Server-side:** Cache in your handlers or at the data layer. In-memory caches, Redis, database query optimization — all work the same as any backend:

```typescript
handler: async (data, context) => {
  const cacheKey = `products:${data.category}`;
  const cached = await redis.get(cacheKey);
  if (cached) return Ok(JSON.parse(cached));

  const products = await fetchProducts(data.category);
  await redis.set(cacheKey, JSON.stringify(products), "EX", 300);
  return Ok({ products });
},
```

It's a trade-off. You lose automatic browser caching in exchange for a simpler, consistent API surface. For the use cases Nile targets — business logic, dashboards, internal tools, multi-step workflows — application-level caching is more appropriate and more controllable anyway.

### Do you differentiate between read and mutate actions?

No. Nile does not distinguish between read and write operations at the protocol level. Every action goes through `POST {baseUrl}/services` regardless of whether it reads data or mutates it.

Splitting reads into `GET` with query params and mutations into `POST` would enable HTTP-level caching and CDN compatibility, but it would also mean two different request formats, two different parsing paths, and payload limitations from URL length constraints for complex query shapes. The single-POST model keeps the protocol uniform and the implementation simple.

If HTTP-level caching is critical to your use case (e.g., a public content API behind a CDN), Nile may not be the right tool — see [When should I NOT use Nile?](#when-should-i-not-use-nile).

---

## How do I handle idempotency without PUT/DELETE?

At the application level, which is where idempotency should live anyway. HTTP verb semantics give you theoretical idempotency guarantees that rarely hold in practice for complex operations.

Practical approaches:

- **Idempotency keys** in the payload — clients send a unique key, the server deduplicates
- **Database constraints** — unique indexes prevent duplicate resource creation
- **Action + resource ID** — the combination of `service.action` and the target resource naturally identifies the operation
- **Conditional checks** in handlers — check current state before applying changes

```typescript
handler: async (data, context) => {
  // Idempotency via payload key
  const existing = await findByIdempotencyKey(data.idempotencyKey);
  if (existing) return Ok({ order: existing }); // Already processed

  const order = await createOrder(data);
  return Ok({ order });
},
```

---

## How do I version my API?

Multiple strategies, all straightforward with the action model:

**URL versioning** for major breaking changes:
```typescript
rest: { baseUrl: "/api/v1" } // v1
rest: { baseUrl: "/api/v2" } // v2
```

**Action evolution** — add new actions, deprecate old ones:
```typescript
// Keep the old action working
createAction({ name: "createUser", ... });
// Add the new version alongside it
createAction({ name: "createUserV2", ... });
```

**Payload evolution** — add optional fields, maintain backward compatibility. Since payloads are validated with Zod, you can use `.optional()` and `.default()` to evolve schemas without breaking existing clients.

**Service splitting** — break large services into focused ones as your domain grows. The `explore` intent lets clients discover what's available, so renaming or splitting services is transparent.

The action-based model actually makes versioning easier than endpoint-based APIs — adding a new action never conflicts with existing ones, and the `schema` intent always reflects the current state.

---

## How does testing work?

The consistent request/response format simplifies testing significantly.

**Unit testing actions** — handlers are plain functions that take data and return Results:

```typescript
import { describe, it, expect } from "vitest";

describe("createTask", () => {
  it("creates a task with valid data", () => {
    const result = createTaskHandler({ title: "Test" });
    expect(result.isOk).toBe(true);
    expect(result.value).toEqual({ task: { id: expect.any(String), title: "Test" } });
  });

  it("rejects empty title", () => {
    const result = createTaskHandler({ title: "" });
    expect(result.isErr).toBe(true);
  });
});
```

**Integration testing** — one endpoint to mock, standardized responses:

```typescript
const response = await app.request("/api/services", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    intent: "execute",
    service: "tasks",
    action: "create",
    payload: { title: "Test" },
  }),
});

const json = await response.json();
expect(json.status).toBe(true);
```

**Client testing** — mock the single endpoint and test all service interactions:

```typescript
const nile = createNileClient({ baseUrl: "http://mock/api" });
const { error, data } = await nile.invoke({
  service: "tasks",
  action: "create",
  payload: { title: "Test" },
});
```

No route table to replicate, no verb-specific mocks, no middleware stacking per test.

---

## What runtimes does Nile support?

Nile runs on **Bun** and **Node.js**. The HTTP layer is built on [Hono](https://hono.dev), which supports both runtimes natively.

- **Bun** — recommended for development and production. Fastest startup, native TypeScript support, built-in test runner.
- **Node.js** — fully supported via `@hono/node-server`. Use this when deploying to environments that don't support Bun.

Runtime-specific features (like static file serving) are handled via dynamic adapter imports — the same code works on both runtimes without configuration changes.

---

## What databases work with Nile?

Nile is database-agnostic. The framework doesn't prescribe a database or ORM — you pass your database instance as a resource and access it via context:

```typescript
const server = createNileServer({
  services: [/* ... */],
  resources: {
    database: myDrizzleInstance, // or Prisma, Kysely, raw pg, etc.
  },
});
```

The built-in `createModel` utility provides a typed CRUD model factory for [Drizzle ORM](https://orm.drizzle.team), but this is optional. You can use any database client or ORM — just pass it through resources and access it in your handlers.

---

## Does Nile support file uploads?

Yes. Nile handles multipart `FormData` requests natively. The REST layer detects the content type and parses files automatically.

Server-side, uploaded files arrive in the action payload alongside regular fields. You can configure validation rules for file size, count, and MIME types.

The `@nilejs/client` provides an `upload` method and a `buildFormData` utility for constructing upload requests:

```typescript
const { error, data } = await nile.upload({
  service: "media",
  action: "uploadImage",
  payload: formData,
});
```

See the upload configuration in your server's `RestConfig` for validation options.

---

## When should I NOT use Nile?

Nile is not the right fit for every project:

- **Public APIs where REST conventions are expected** — if your API consumers expect standard REST verbs and resource-based URLs, Nile's single-endpoint model will confuse them
- **Simple CRUD apps** — if your entire backend is basic resource operations with no business logic, a REST framework with auto-generated routes is faster to set up
- **Teams deeply invested in GraphQL** — if GraphQL is working and the team knows it, switching adds friction with no clear gain
- **Performance-critical APIs that rely on HTTP caching** — CDN-level caching with ETags and Cache-Control headers doesn't apply to a single POST endpoint
- **Cross-organization APIs** — when API consumers are external teams with their own tooling expectations, standard REST or GraphQL is the safer choice

Nile excels at internal APIs, complex business logic, multi-service architectures, and teams that want structured, discoverable backends without boilerplate.

---

## How do I migrate from an existing REST API?

Gradual migration works best:

1. **Start new features with Nile** — new services and actions are built in Nile from day one
2. **Wrap existing endpoints** — create Nile actions that proxy to your existing REST handlers during transition
3. **Migrate high-change services first** — services with frequent updates benefit most from the action model
4. **Keep stable CRUD services as-is** — if it works and rarely changes, there's no urgency to migrate
5. **Use an API gateway** — route `/api/v2/services` to Nile and legacy routes to the old server during transition

The action-based model doesn't require an all-or-nothing switch. You can run Nile alongside existing infrastructure and migrate incrementally.

---

## How steep is the learning curve?

Minimal. If you can write a function that takes input and returns output, you can write a Nile action. The core concepts are:

- **Service** = a named group of related operations
- **Action** = a function with a name, optional validation, and a handler
- **Intent** = what you want to do (execute, explore, schema)

That's it. No decorators, no class hierarchies, no dependency injection containers, no module systems to learn. Define actions as functions, group them into services, start the server.

```typescript
// This is a complete Nile action
export const hello = createAction({
  name: "hello",
  description: "Say hello",
  handler: (data) => Ok({ message: `Hello, ${data.name}` }),
});
```

Most developers are productive within an hour because they're already thinking in terms of functions and operations. The framework just gives that mental model a consistent structure.

---

## How is Nile different from MCP (Model Context Protocol)?

Nile is a backend framework. MCP is a protocol for connecting AI models to tools. They emerged around the same time from different starting points and landed on similar-ish patterns — named operations, structured payloads, discovery — but they solve different problems.

### The Core Difference

Nile builds your backend. It's your API, your business logic, your auth, your validation, your hooks pipeline. Whether you ever expose it to AI is entirely up to you.

MCP defines how an AI model calls external tools during a conversation. It's a communication protocol, not a framework — it doesn't handle auth, validation pipelines, database access, error logging, or any of the things a real backend needs.

### Why the Similarity?

Both Nile and MCP converged on the same structural insight: named operations with typed inputs are more expressive than verb-based routing. In Nile this is `service.action` with Zod schemas. In MCP this is tool definitions with JSON Schema parameters. The pattern is the same because the underlying idea — explicit operations over implicit conventions — is just a good idea.

### AI Integration Without MCP

Here's the practical point: if you build your backend with Nile, you already have everything an AI agent needs to interact with it. Every action has a name, a description, and a typed schema. The `explore` intent returns what's available. The `schema` intent returns the exact input shapes. An AI model can discover your API, understand what each operation does, and call it — all through the same endpoint your frontend uses.

You don't need MCP as a middleman. Your Nile backend *is* the tool interface. When you want to expose actions to AI, you just point the model at your API — the metadata is already there.

```typescript
// This action is simultaneously:
// - A backend endpoint for your frontend
// - A tool an AI agent can discover and call
export const searchProducts: Action = createAction({
  name: "searchProducts",
  description: "Search products by name, category, or price range",
  validation: z.object({
    query: z.string().optional(),
    category: z.string().optional(),
    minPrice: z.number().optional(),
    maxPrice: z.number().optional(),
  }),
  handler: async (data, context) => {
    const results = await findProducts(data);
    return Ok({ products: results });
  },
});
```

An AI model reading this action's schema from the `explore` or `schema` intent gets everything it needs: the operation name, what it does, and the exact parameters it accepts. No adapter layer, no MCP server, no separate tool definitions to maintain.

### When You'd Use Both

If you're building in an ecosystem that requires MCP specifically (e.g., Claude desktop integrations, or tools that only speak MCP), you could write a thin MCP server that proxies to your Nile backend. The mapping is almost 1:1 — action names become tool names, Zod schemas become JSON Schema parameters. But that's an integration choice, not a requirement.

### Vibe Coding Ready

Nile is indexed on [Context7](https://context7.com/nile-js/nile), an MCP server that feeds up-to-date library documentation directly into AI coding assistants. This means any AI tool with Context7 MCP support (Cursor, Windsurf, Copilot, Claude Code, etc.) can pull Nile's full documentation — services, actions, hooks, auth, uploads, client SDK — into context while generating code.

You don't need to paste docs or explain the framework to your AI. It already knows Nile.

**Bottom line:** Build your backend with Nile. If AI needs to talk to it, the structure is already there. MCP is a protocol for a specific use case. Nile is the framework that builds the thing the protocol talks to.
