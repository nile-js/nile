---
title: "Composing hooks"
description: "Build a checkout from local before and after hooks, a global after hook and clear rules for critical steps"
---

Hooks let an action share steps with other actions. A local hook names another action whose handler runs as a step before or after the main handler. A global hook runs for every action. Use them to split a workflow into steps you can test and reuse.

## When to use composition

Use a local hook when a step produces data the main handler needs, such as normalizing an order line before checkout. Use a global hook for checks that apply to every action, such as request auditing. If the steps are not reused, a plain function call inside the handler is easier to read.

## Complete example

`orders.checkout` normalizes its input in a before hook, validates the normalized value and then runs the checkout rule. An after hook adds a `receivedAt` time to the response. A global after hook records the action name in the execution state.

```ts
import {
  type AfterActionHandler,
  createAction,
  createNileServer,
  createServices,
} from "@nilejs/nile";
import { Err, Ok } from "@nilejs/nile/fp";
import { z } from "zod";

const prepareOrderSchema = z.object({
  sku: z.string().trim().min(1, "SKU is required"),
  quantity: z.number().int().min(1, "Quantity must be at least 1"),
});

type PrepareOrderInput = z.infer<typeof prepareOrderSchema>;

const prepareOrderHook = (data: PrepareOrderInput) => {
  const normalized = {
    sku: data.sku.toUpperCase(),
    quantity: data.quantity,
  };
  return Ok(normalized);
};

const prepareOrderAction = createAction({
  name: "prepare",
  description: "Normalize an order line before checkout",
  validation: null,
  handler: prepareOrderHook,
});

type CheckoutInput = z.infer<typeof prepareOrderSchema>;

const checkoutSchema = prepareOrderSchema;

const checkoutHandler = (data: CheckoutInput) => {
  if (data.quantity > 100) {
    return Err("Quantity exceeds the checkout limit");
  }

  return Ok({ sku: data.sku, quantity: data.quantity, status: "accepted" });
};

const stampHook = (data: Record<string, unknown>) => {
  return Ok({ ...data, receivedAt: new Date().toISOString() });
};

const stampAction = createAction({
  name: "stamp",
  description: "Attach checkout metadata to the response",
  handler: stampHook,
});

const checkoutAction = createAction({
  name: "checkout",
  description: "Accept a checkout request",
  validation: checkoutSchema,
  hooks: {
    before: [
      {
        service: "orders",
        action: "prepare",
        isCritical: true,
      },
    ],
    after: [
      {
        service: "orders",
        action: "stamp",
        isCritical: false,
      },
    ],
  },
  handler: checkoutHandler,
});

const services = createServices([
  {
    name: "orders",
    description: "Checkout operations",
    actions: [prepareOrderAction, stampAction, checkoutAction],
  },
]);

const recordAuditTrail: AfterActionHandler<unknown, unknown> = (hookContext) => {
  hookContext.nileContext.updateHookState("audited", hookContext.action.name);
  if (hookContext.result.isErr) {
    return Err(String(hookContext.result.error));
  }
  return Ok(hookContext.result.value);
};

export const server = await createNileServer({
  serverName: "shop",
  services: services,
  onAfterActionHandler: recordAuditTrail,
  rest: { baseUrl: "/api", allowedOrigins: ["https://shop.example.com"] },
});
```

## The order of steps

1. JWT verification, for protected actions.
2. The global before hook.
3. Local before hooks, in listed order. Each receives the previous step's value.
4. Zod validation of the final value.
5. The handler.
6. Local after hooks, in listed order. Each receives the previous step's value.
7. The global after hook, which receives the final Result.

In the example, `prepare` receives the raw payload and returns the uppercased SKU, and Zod then validates the normalized value.

## Local hooks

| Field | Meaning |
| --- | --- |
| `service`, `action` | The action whose handler runs. |
| `isCritical` | `true` stops the pipeline when the hook fails. `false` records the failure and continues with the previous value. |

A local hook runs only its handler, skipping that action's JWT check, validation and hooks. Put any required check inside the hook's handler; `isProtected` on the hook's action protects nothing.

## Global hooks

Pass `onBeforeActionHandler` and `onAfterActionHandler` to `createNileServer`. The global before hook returns `Ok(true)` to continue. Its value does not replace the payload, so use a local hook to transform input. The global after hook returns a Result that becomes the final output. It runs only when earlier steps succeeded.

## Shared state across steps

Hooks and the handler share one state object for the current execution. `updateHookState` writes to it and `hookContext.state` reads it. Concurrent and nested executions have separate state, so one order's value cannot leak into another.

## Pipeline output for debugging

Set `result: { pipeline: true }` on an action to return the final output together with the logs for each hook. The logs include inputs and outputs, so enable it only for actions whose inputs your callers may see.

## Limits

- A failing hook undoes no writes from earlier steps. Keep writes in the final step, or reverse them yourself.
- Hook logs contain payloads, so keep pipeline output off for actions handling secrets.
- The global after hook runs only when every earlier step succeeded.

## Common mistakes

- Expecting a local hook to enforce its target action's `isProtected` or validation.
- Making a noncritical hook responsible for a required change. Its failure is recorded and then ignored.
- Returning `Ok(payload)` from the global before hook and expecting the payload to change.

## See also

- [Hooks and pipelines](/guide/basics/hooks-and-pipelines) gives the complete rules.
- [Authentication and hooks](/guide/features/authentication-and-hooks) shows a role check in a global hook.
- [Handler context](/guide/advanced/handler-context) explains the shared execution state.
