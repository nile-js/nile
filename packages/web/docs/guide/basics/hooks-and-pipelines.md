---
title: "Hooks and pipelines"
description: "Compose shared policies and action-specific work in a defined execution order"
---

Use hooks for checks or transformations shared by several actions. Global hooks run across the application; local hooks form part of an action’s pipeline.

## Know when each step runs

For an executed action, the order is:

1. Built-in JWT authentication, if both `auth` and `isProtected` are configured.
2. Global `onBeforeActionHandler`.
3. Action `hooks.before`, in their listed order.
4. The main action's Zod validation.
5. Main handler.
6. Action `hooks.after`, in their listed order, after handler success.
7. Global `onAfterActionHandler`, after successful preceding steps.

A before hook sees input **before validation**, so check every value it reads. A failing step stops the steps after it, except a failing local hook marked `isCritical: false`.

## Global checks

Require a session before a protected action runs:

```ts
import type { BeforeActionHandler } from "@nilejs/nile";
import { Err, Ok } from "@nilejs/nile/fp";

const onBeforeActionHandler: BeforeActionHandler<boolean, string> = (
  hookContext
) => {
  const session = hookContext.nileContext.getSession("rest");
  if (hookContext.action.isProtected && session === undefined) {
    return Err("Sign in to continue");
  }
  return Ok(true);
};
```

Set `onBeforeActionHandler` in your server configuration to this hook. When it returns `Ok`, the action continues with the original payload: **its returned value is ignored**. Use local before hooks to transform input. When it returns `Err`, the action stops.

The global after hook receives `{ nileContext, action, payload, result }`, and its Result becomes the final output, so returning `Err` fails the call. It runs only after every earlier step succeeded; put cleanup in `finally` or the lifecycle.

## Local transformations

Local hooks reference registered actions:

```ts
hooks: {
  before: [
    { service: "policies", action: "prepare-project", isCritical: true },
  ],
  after: [
    { service: "presenters", action: "project-summary", isCritical: true },
  ],
}
```

The before chain starts with the original payload. Each successful hook's `value` becomes the next hook's input, then the main schema validates the final value. The after chain starts with the handler's successful value, and each hook's `value` replaces the response in the same way.

A referenced hook runs **only its handler**, skipping that action's own authentication, validation and hooks. Put required checks inside the hook handler; `isProtected` on a hook action protects nothing.

| Local hook outcome | `isCritical: true` | `isCritical: false` |
|---|---|---|
| `Ok(value)` | Pass value to the next step | Pass value to the next step |
| `Err(message)` | Stop with failure | Record failure and keep the preceding value |
| Missing referenced action | Stop with failure | Record the diagnostic and continue |

Mark a step noncritical only when the action can succeed without it. A failure undoes no earlier writes. A hook that only observes should return the input it received.

## Keep state local to the execution

Hooks and the handler share `nileContext.hookContext` for the current call. `updateHookState(key, value)` stores state for this call only, kept apart from concurrent and nested calls, global hooks included.

`result: { pipeline: true }` returns `{ data: finalOutput, pipeline: hookLogs }` as the action value. Hook logs include inputs and outputs, so enable it only when the caller may see them. Use it for debugging; it stores nothing.
