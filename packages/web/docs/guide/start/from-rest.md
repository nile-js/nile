# From REST to Nile

**Type:** Concept

This document explains the design decisions behind Nile and guides the transition from endpoint-based thinking to the service-action model.

## 1. The Problem with Endpoint-Based APIs

Traditional REST APIs organize code around HTTP verbs and URL paths. A typical backend has:

- Route definitions scattered across files
- Middleware stacks configured per route or globally
- HTTP verbs (GET, POST, PUT, DELETE) dictating operation semantics
- Separate documentation (OpenAPI, Swagger) to describe what endpoints exist
- Manual validation logic in each handler

As the API grows, these patterns create maintenance overhead. Adding a new operation requires: defining a route, choosing an HTTP verb, configuring middleware, writing validation, and updating documentation.

## 2. Nile's Solution: Intent-Based Routing

Nile replaces the endpoint model with a single POST endpoint and an intent field in the request body.

### 2.1 Why a Single Endpoint

All requests go to `POST {baseUrl}/services`. The request body contains:

```json
{
  "intent": "execute",
  "service": "orders",
  "action": "create",
  "payload": { "items": [{ "productId": "p1", "quantity": 2 }] }
}
```

This design exists for three reasons:

- **Simplified routing**: No route table to maintain. The engine builds a dictionary at boot and performs O(1) lookups.
- **Unified interface**: Every operation uses the same request and response shape. Clients do not need different handling for different endpoints.
- **Built-in discovery**: The `explore` intent returns all available services and actions. No separate documentation is required.

### 2.2 Why No HTTP Verbs

HTTP verbs encode operation semantics: GET for reading, POST for creating, PUT for updating, DELETE for removing. This works well for CRUD but breaks down for real business operations.

Consider these operations:

- Refund an order
- Approve a KYC submission
- Send a notification
- Calculate tax

None of these map cleanly to HTTP verbs. They are not "create" or "update" in the REST sense. They are domain operations. Nile treats them all the same way: an action within a service.

The intent field replaces HTTP verbs:

- `execute` runs business logic
- `explore` discovers available operations
- `schema` retrieves validation schemas

### 2.3 Why Service and Action

A **service** is a bounded context. It groups related operations: `orders`, `payments`, `users`.

An **action** is a single operation within that context: `create`, `refund`, `getStatus`.

This model maps to how developers think about their domain. You do not think "I need a POST endpoint at /orders/:id/refund". You think "I need to refund an order". The service-action model captures that directly.

## 3. Mental Model Translation

The following table maps REST concepts to their Nile equivalents:

| REST Concept | Nile Equivalent | Notes |
|---|---|---|
| Route prefix (`/users`) | Service name (`users`) | Domain grouping |
| Route handler (`GET /users/:id`) | Action (`getUser`) | Single operation |
| HTTP verb (GET, POST, PUT, DELETE) | Intent (`execute`) | What you want to do |
| Route parameters (`:id`) | Payload fields (`{ "id": "..." }`) | Input data |
| Middleware per route | Hooks (`before`, `after`) | Pre and post processing |
| Global middleware | Global hooks (`onBeforeActionHandler`) | Cross-cutting concerns |
| OpenAPI / Swagger docs | `explore` and `schema` intents | Runtime discovery |
| Request validation | Zod schema on action | Runtime type checking |

## 4. What Nile Does Not Do

Nile is not a general-purpose HTTP framework. It makes deliberate trade-offs:

- **No individual routes**: All service interactions go through `POST {baseUrl}/services`. Custom routes are possible for non-service endpoints (webhooks, health checks) but are not the primary interface.
- **No HTTP verb semantics**: GET, POST, PUT, DELETE are not used. The intent field determines behavior.
- **No streaming or SSE through the service layer**: These require custom routes on the underlying Hono app.
- **No per-action middleware**: Hooks provide pre and post processing, but they follow the pipeline model, not Express-style middleware chains.

These are intentional constraints. They reduce complexity and enforce consistency.

## 5. What You Gain

- **Consistent response shape**: Every response follows `{ status, message, data }`. Clients handle one format.
- **Consistent error handling**: Every error returns the same shape. No special cases for different endpoints.
- **Built-in discovery**: Any client can query what operations exist at runtime.
- **Type safety**: `createAction<T>` enforces payload types at compile time. Zod validates at runtime.
- **Composable operations**: Hooks allow cross-service composition without tight coupling.
- **Simplified client code**: One endpoint, one request format, one response format.

## 6. What You Give Up

- **HTTP caching semantics**: GET caching does not apply. Cache headers must be managed explicitly.
- **Browser-native behavior**: Forms and links cannot target Nile actions directly. All interaction requires JavaScript or an HTTP client.
- **REST tooling**: Tools that expect standard REST endpoints (Postman collections, API gateways) need adaptation.
- **Fine-grained route control**: You cannot assign different middleware to different actions. Hooks are the extension point.

## 7. When to Use Nile

Nile fits when:

- You want structured, discoverable APIs without OpenAPI maintenance
- Your frontend and backend are in separate repositories
- Your domain has clear bounded contexts with named operations
- You value consistency over HTTP semantics

Nile does not fit when:

- You need streaming responses or Server-Sent Events through your primary API
- Your API is consumed by browsers without JavaScript
- You are deeply invested in REST tooling and conventions
- Your operations map cleanly to CRUD and HTTP verbs
