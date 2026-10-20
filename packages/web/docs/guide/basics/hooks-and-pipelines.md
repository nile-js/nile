# Reuse a policy across operations

When several actions need the same check or transformation, put it in a recognizable pipeline step. That keeps the next operation small and makes the shared rule easier to review.

## Know when each step runs

For an executed action, the order is:

1. Built-in JWT authentication, if both `auth` and `isProtected` are configured.
2. Global `onBeforeActionHandler`.
3. Action `hooks.before`, in their listed order.
4. The main action's Zod validation.
5. Main handler.
6. Action `hooks.after`, in their listed order, after handler success.
7. Global `onAfterActionHandler`, after successful preceding steps.

A before hook sees input **before validation**. Check the values it uses; do not treat the payload as validated business input yet. A failing step stops later steps except for a noncritical local hook failure.

## Global checks

This server-configuration fragment rejects a protected action without a session:

```typescript
import { Err, Ok } from "slang-ts";

const onBeforeActionHandler = ({ nileContext, action, payload }) => {
  if (action.isProtected && !nileContext.getSession("rest")) {
    return Err("Sign in to continue");
  }
  return Ok(payload);
};
```

For a standalone typed declaration, annotate this function with `BeforeActionHandler` as shown in [authentication](/guide/basics/auth). Global before-hook success allows execution to continue; **its returned value does not replace the payload**. Use local before hooks for transformations. Global before-hook failure always stops execution.

The global after hook receives `{ nileContext, action, payload, result }`. Its Result becomes the final output; returning an error stops success. It is not an always-run `finally` callback and does not run after an earlier failure.

## Local transformations

Local hooks reference registered actions:

```typescript
hooks: {
  before: [
    { service: "policies", action: "prepare-project", isCritical: true },
  ],
  after: [
    { service: "presenters", action: "project-summary", isCritical: true },
  ],
}
```

The before chain starts with the original payload. Each successful hook's `value` becomes the next hook's input, then the main schema validates the final value. The after chain starts with the handler's successful value and similarly replaces the eventual response.

A referenced hook runs **its handler directly**. Nile does not recursively run that action's own authentication, validation or hook pipeline. Put required checks inside the hook handler; setting `isProtected` on a referenced hook alone does not protect the parent operation.

| Local hook outcome | `isCritical: true` | `isCritical: false` |
|---|---|---|
| `Ok(value)` | Pass value to the next step | Pass value to the next step |
| `Err(message)` | Stop with failure | Record failure and keep the preceding value |
| Missing referenced action | Stop with failure | Record the diagnostic and continue |

Use noncritical steps only when losing that step is acceptable. They do not roll back earlier writes. For observation that must preserve the result, return the received input on success.

## Keep state local to the execution

Hooks and the handler share `nileContext.hookContext` for the current action execution. `updateHookState(key, value)` stores execution-local information. Global hooks still run; their state is isolated between concurrent and nested action executions.

`result: { pipeline: true }` returns `{ data: finalOutput, pipeline: hookLogs }` as the action value. Hook logs include inputs and outputs, so enable this only when those details are suitable for the caller. This is a debugging aid, not a durable audit trail.
