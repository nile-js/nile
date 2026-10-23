---
title: "Rate-limited quote"
description: "Publish a public price action that allows a short burst per client, then refuses requests until the bucket refills"
---

This example adds a public `catalog.quote` action with a token-bucket limit. Each client may send a burst of 20 requests, and the bucket refills at 5 requests per second. A client that exceeds the limit gets a failure that says how long to wait.

## What you need

- The starter project from the [examples overview](/guide/examples), installed with `bun install`.

## 1. Write the public action

Create `src/services/catalog/actions/quote.ts`. It is not protected, so anyone who can reach the server can call it. The limit is what protects it:

```ts
import { createAction } from "@nilejs/nile";
import { Err, Ok } from "slang-ts";
import { z } from "zod";

const quoteSchema = z.object({
  sku: z.string().trim().min(1, "SKU is required"),
  quantity: z.number().int().min(1, "Quantity must be at least 1").max(10, "Quantity cannot exceed 10"),
});

type QuoteInput = z.infer<typeof quoteSchema>;

const PRICE_IN_CENTS: Readonly<Record<string, number>> = {
  "TSHIRT-BLUE": 1500,
  "MUG-WHITE": 900,
};

const quoteHandler = (input: QuoteInput) => {
  const unitPrice = PRICE_IN_CENTS[input.sku];
  if (unitPrice === undefined) {
    return Err("Unknown SKU");
  }

  return Ok({
    sku: input.sku,
    quantity: input.quantity,
    totalInCents: unitPrice * input.quantity,
  });
};

export const quoteAction = createAction<QuoteInput>({
  name: "quote",
  description: "Return the public price for a product quantity",
  validation: quoteSchema,
  handler: quoteHandler,
});
```

## 2. Register the service

Replace `src/services/services.config.ts` so the `catalog` service is registered next to `tasks`:

```ts
import { createServices, type Services } from "@nilejs/nile";
import { quoteAction } from "./catalog/actions/quote";
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
    name: "catalog",
    description: "Public product information",
    actions: [quoteAction],
  },
]);
```

## 3. Add the limiter

Replace `src/index.ts`. The `execution.rateLimit` policy applies to every action. Its key is the client's address, which Nile Js provides in `context.clientKey`:

```ts
import { createLogger, createNileServer, utils } from "@nilejs/nile";
import { sql } from "drizzle-orm";
import { Ok, safeTry } from "slang-ts";
import { db } from "@/db/client";
import { services } from "@/services/services.config";

const logger = createLogger("my-app", {
  mode: "dev",
  chunking: "monthly",
});

/** Token bucket: a burst of 20 quotes per client, refilled at 5 per second. */
const quoteLimiter = utils.createRateLimiter({
  strategy: "token-bucket",
  capacity: 20,
  refillPerSecond: 5,
  maxKeys: 10_000,
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
  execution: {
    rateLimit: {
      store: quoteLimiter,
      key: ({ context }) => context.clientKey ?? "anonymous",
    },
  },
  rest: {
    baseUrl: "/api",
    host: "localhost",
    port: 8000,
    allowedOrigins: ["http://localhost:8000"],
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

if (server.nativeRest) {
  const port = server.config.rest?.port ?? 8000;
  Bun.serve({ port, fetch: server.nativeRest.fetch });
  console.log(`\nmy-app listening on http://localhost:${port}\n`);
}
```

## 4. Run the server

```sh
bun run dev
```

You should see the `listening` line:

```text
my-app listening on http://localhost:8000
```

## 5. Send a burst

In a second terminal, send 25 requests in a row and print each HTTP status:

```sh
for i in $(seq 1 25); do
  curl -s -o /dev/null -w "%{http_code} " -X POST http://localhost:8000/api/services \
    -H "Content-Type: application/json" \
    -d '{"intent":"execute","service":"catalog","action":"quote","payload":{"sku":"MUG-WHITE","quantity":2}}'
done
echo
```

You should see 21 `200` responses followed by 4 `400` responses. The exact split depends on timing, because the bucket refills while the loop runs:

```text
200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 400 400 400 400
```

## 6. Read the refusal

The first refused request returns:

```json
{
  "status": false,
  "message": "Rate limit exceeded; retry after 147ms",
  "data": {}
}
```

The number changes between runs. Wait for the time shown, then send another request. A request after the wait returns the quote:

```sh
curl -s -X POST http://localhost:8000/api/services \
  -H "Content-Type: application/json" \
  -d '{"intent":"execute","service":"catalog","action":"quote","payload":{"sku":"TSHIRT-BLUE","quantity":3}}'
```

You should see HTTP 200 and the total in cents:

```json
{"status":true,"message":"Action 'catalog.quote' executed","data":{"sku":"TSHIRT-BLUE","quantity":3,"totalInCents":4500}}
```

## 7. Type-check

```sh
./node_modules/.bin/tsc --noEmit
```

You should see no output and exit with status 0.

## Limits in this example

- The limiter keeps its counts in this process. Two replicas each allow a full burst.
- Restarting the server resets every client's bucket.
- Every client behind one proxy may share one address. Configure the server's client address resolution before you rely on per-client limits in production.

## Troubleshooting

- **Every request is refused right away.** The earlier loop used up the bucket. Wait a few seconds and try again.
- **`Unknown SKU`.** Use `MUG-WHITE` or `TSHIRT-BLUE`, the two SKUs in the handler's price table.

## See also

- [Rate limiting](/guide/features/rate-limiting) explains the strategies, policy layers and the HTTP-level limit.
- [Execution options](/guide/advanced/execution-options) shows per-service and per-action policies.
- [Production operations](/guide/reference/operations) covers client addresses behind proxies.
