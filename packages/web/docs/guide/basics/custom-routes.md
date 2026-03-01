# Custom Routes

Nile's REST interface is a standard Hono app. After creating your server, you can add custom routes directly on the Hono instance for things Nile doesn't handle through the service/action model — webhooks, OAuth callbacks, health checks, or any traditional HTTP endpoint.

## Accessing the Hono App

`createNileServer` returns a `NileServer` object with a `rest.app` property — a regular Hono instance:

```typescript
import { createNileServer } from "@nilejs/nile";

const server = createNileServer({
  name: "MyApp",
  services: [/* ... */],
  rest: {
    baseUrl: "/api/v1",
    allowedOrigins: ["http://localhost:3000"],
  },
});

const app = server.rest?.app;
```

## Adding Routes

Use any Hono method (`get`, `post`, `put`, `delete`, `all`) to register custom routes:

### Webhook Endpoint

```typescript
app?.post("/webhooks/stripe", async (c) => {
  const signature = c.req.header("stripe-signature");
  const body = await c.req.text();

  // Verify and process the webhook
  const event = verifyStripeSignature(body, signature);

  if (!event) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  await processStripeEvent(event);
  return c.json({ received: true });
});
```

### OAuth Callback

```typescript
app?.get("/auth/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");

  if (!code || !state) {
    return c.json({ error: "Missing code or state" }, 400);
  }

  const tokens = await exchangeCodeForTokens(code);
  // Set cookie, create session, etc.

  return c.redirect("/dashboard");
});
```

### Custom Health Check

```typescript
app?.get("/health", async (c) => {
  const dbHealthy = await checkDatabaseConnection();
  const cacheHealthy = await checkCacheConnection();

  const healthy = dbHealthy && cacheHealthy;

  return c.json({
    status: healthy ? "ok" : "degraded",
    checks: {
      database: dbHealthy ? "up" : "down",
      cache: cacheHealthy ? "up" : "down",
    },
  }, healthy ? 200 : 503);
});
```

## Using Nile Context in Custom Routes

Access the shared `NileContext` from custom routes using `getContext`:

```typescript
import { createNileServer, getContext } from "@nilejs/nile";

const server = createNileServer({
  name: "MyApp",
  services: [/* ... */],
  resources: { database: db, logger },
  rest: {
    baseUrl: "/api/v1",
    allowedOrigins: ["http://localhost:3000"],
  },
});

server.rest?.app.post("/webhooks/payment", async (c) => {
  const ctx = getContext<typeof db>();
  const logger = ctx.resources?.logger;
  const database = ctx.resources?.database;

  const payload = await c.req.json();

  logger?.info({
    atFunction: "webhookHandler",
    message: "Payment webhook received",
    data: { eventType: payload.type },
  });

  // Use your database, cache, or any shared resource
  await database?.insert(payments).values({
    eventId: payload.id,
    amount: payload.amount,
  });

  return c.json({ processed: true });
});
```

## Adding Middleware

You can also add Hono middleware to the app for custom routes:

```typescript
// Apply to specific paths
app?.use("/webhooks/*", async (c, next) => {
  const apiKey = c.req.header("x-api-key");
  if (apiKey !== process.env.WEBHOOK_SECRET) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await next();
});

// Then register your webhook handlers
app?.post("/webhooks/stripe", stripeHandler);
app?.post("/webhooks/github", githubHandler);
```

## Route Order

Custom routes registered after `createNileServer` are added after Nile's built-in routes. The order is:

1. CORS middleware
2. Rate limiting middleware
3. Static file serving (`/assets/*`)
4. `POST {baseUrl}/services` (Nile RPC)
5. `GET /status` (if enabled)
6. **Your custom routes**
7. 404 handler

Since Nile's 404 handler catches unmatched routes, register your custom routes **before** exporting the app for serving.

## Full Example

```typescript
import { createNileServer, getContext } from "@nilejs/nile";
import { Ok } from "slang-ts";

const server = createNileServer({
  name: "PaymentService",
  services: [
    {
      name: "payments",
      description: "Payment processing",
      actions: [
        {
          name: "list",
          description: "List recent payments",
          handler: () => Ok({ payments: [] }),
        },
      ],
    },
  ],
  resources: { database: db },
  rest: {
    baseUrl: "/api/v1",
    allowedOrigins: ["http://localhost:3000"],
    enableStatus: true,
  },
});

const app = server.rest?.app;

// Stripe webhook — outside the service/action model
app?.post("/webhooks/stripe", async (c) => {
  const ctx = getContext();
  const body = await c.req.json();
  // Process webhook...
  return c.json({ received: true });
});

// OAuth callback
app?.get("/auth/google/callback", async (c) => {
  const code = c.req.query("code");
  // Exchange code, set session...
  return c.redirect("/");
});

export default app;
```
