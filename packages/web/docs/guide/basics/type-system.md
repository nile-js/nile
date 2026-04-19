# Type System

Nile's type system provides compile-time safety for action payloads, handler parameters, and client responses, while using Zod for runtime validation.

## Generic Action Types

`Action<T, E>` and `ActionHandler<T, E>` are generic types. `T` represents the payload or result type. `E` represents the error type. `createAction<T, E>` preserves type inference through the action lifecycle.

```typescript
// services/payments/make-payout.ts
import { Ok, Err } from "slang-ts";
import { createAction, type ActionHandler } from "@nilejs/nile";
import { z } from "zod";

const makePayoutSchema = z.object({
  transactionId: z.string(),
  amount: z.number().positive(),
});

type MakePayoutPayload = z.infer<typeof makePayoutSchema>;

const handler: ActionHandler<MakePayoutPayload> = async (data) => {
  // data is typed as MakePayoutPayload
  return Ok({ transactionId: data.transactionId, status: "processed" });
};

export const makePayout = createAction({
  name: "make-payout",
  description: "Process a payout",
  handler,
  validation: makePayoutSchema,
});
```

## Type Flow

Types flow through the system in a defined sequence:

- `ActionHandler<T, E>` — handler receives `data: T`, returns `Result<T, E>`
- `Action<T, E>` — the action config carries generics through registration
- `createAction<T, E>()` — returns `Action<T, E>`, preserving inference
- Zod validation guarantees `data` matches `T` before handler execution

The handler parameter `data` is typed at compile time. Zod validates at runtime. Both must align.

## Collection Boundaries

Actions collected into a `Service` lose individual `T` types. TypeScript lacks existential types. `Actions = Action<any, any>[]` is a heterogeneous collection boundary.

Individual actions retain full type safety via `createAction<T>()`. Type erasure occurs only at the service registration boundary. This is a deliberate trade-off for runtime flexibility.

## Client-Side Type Safety

`ExternalResponse<T>`, `ClientResult<T>`, and `createNileClient<TPayloads>()` provide typed client interactions. The `TPayloads` generic encodes service and action shapes.

```typescript
// clients/nile-client.ts
import { createNileClient } from "@nilejs/client";

interface ServicePayloads {
  payments: {
    "make-payout": { transactionId: string; amount: number };
  };
}

const nile = createNileClient<ServicePayloads>({ baseUrl: "/api" });

// TypeScript enforces service name, action name, and payload shape
const { error, data } = await nile.invoke({
  service: "payments",
  action: "make-payout",
  payload: { transactionId: "tx_123", amount: 5000 },
});
```

Invalid service names, action names, or payload shapes produce compile-time errors.

## Discovery and Schema Generation

The `explore` and `schema` intents provide runtime type information. `schema` exports Zod schemas as JSON Schema for code generation.

```typescript
// clients/discovery.ts
import { createNileClient } from "@nilejs/client";

const nile = createNileClient({ baseUrl: "/api" });

// Discover available services
const { data: { services } } = await nile.explore({
  service: "*",
  action: "*",
});

// Get schemas for code generation
const { data: schemas } = await nile.schema({
  service: "payments",
  action: "*",
});
```

Generated types from schemas can seed `TPayloads` interfaces. See [Actions](/guide/basics/actions) for intent details.

## Type Safety Boundaries

| Layer | Type Safety | Notes |
|-------|-------------|-------|
| `createAction<T>()` | Full | Handler `data` parameter typed as `T` |
| `Service` registration | Partial | `T` erased at collection boundary (`any`) |
| Zod validation | Runtime | Guarantees payload matches schema before handler |
| Engine execution | None | `executeAction` uses `unknown` |
| Client `invoke<TPayloads>()` | Full | Service, action, and payload shape enforced |
| Client `explore` / `schema` | Full | Typed response shapes |

Type safety is enforced at action definition and client invocation. Runtime validation via Zod bridges the gap at collection and engine boundaries.
