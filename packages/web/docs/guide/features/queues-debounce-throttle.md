---
title: "Queues, debounce and throttle"
description: "Limit concurrency with queues, collapse repeated calls with debounce and cap call frequency with throttle"
---

Nile Js provides function controls for work that should not run in parallel, repeat too often or pile up. Each control wraps one task function and returns a `run` method that resolves with a Result. The controls live in memory, so they apply to one process.

## When to use each control

| Control | Use it when |
| --- | --- |
| `createQueue` | Work must run one or a few at a time, such as sending email. Callers wait in line. |
| `createDebounce` | Only the latest input matters, such as saving a draft after typing stops. Replaced callers fail. |
| `createThrottle` | The task may run at most once per window, such as refreshing a cache. |
| `createBatch` | Items should be grouped and processed together. Each item gets its own Result. |

## Complete example

This module defines a receipt queue with two workers, a draft debounce and a cache throttle. Create each control once at module level so every request shares it.

```ts
import { utils } from "@nilejs/nile";
import { type Result, Ok } from "@nilejs/nile/fp";

type ReceiptEmail = {
  orderId: string;
  to: string;
};

type SendReceiptResult = {
  sent: boolean;
};

const deliverEmail = async (
  message: ReceiptEmail,
  signal: AbortSignal
): Promise<void> => {
  if (signal.aborted) {
    return;
  }
  await Promise.resolve(message);
};

const sendReceiptTask = async (
  email: ReceiptEmail,
  signal: AbortSignal
): Promise<Result<SendReceiptResult, string>> => {
  await deliverEmail(email, signal);
  return Ok({ sent: true });
};

/** At most two receipts are sent at once; up to 200 more wait in line. */
export const receiptQueue = utils.createQueue<ReceiptEmail, SendReceiptResult>({
  task: sendReceiptTask,
  concurrency: 2,
  capacity: 200,
});

type DraftSave = {
  documentId: string;
  body: string;
};

const saveDraftTask = async (draft: DraftSave): Promise<{ savedAt: string }> => {
  await Promise.resolve(draft.documentId);
  return { savedAt: new Date().toISOString() };
};

/** Saves only the latest draft after the editor has been quiet for 500 ms. */
export const draftDebounce = utils.createDebounce<DraftSave, { savedAt: string }>({
  task: saveDraftTask,
  waitMs: 500,
});

type CacheRefresh = {
  region: string;
};

const refreshCacheTask = async (refresh: CacheRefresh): Promise<void> => {
  await Promise.resolve(refresh.region);
};

/** Runs the first refresh immediately, then at most once per second. */
export const cacheRefreshThrottle = utils.createThrottle<CacheRefresh, void>({
  task: refreshCacheTask,
  waitMs: 1000,
  leading: true,
  trailing: false,
});
```

Call a control from an action handler and read the Result:

```ts
const sent = await receiptQueue.run(
  { orderId: order.id, to: buyer.email },
  { signal: context?.execution?.signal }
);

if (sent.isErr) {
  return Err(sent.error);
}
```

`run` also accepts `{ signal }` so a cancelled request stops waiting. Queued work that has already started keeps its concurrency slot until it finishes.

## Options that matter

| Factory | Options | Default |
| --- | --- | --- |
| `createQueue` | `task`, `concurrency`, `capacity` | `concurrency` 1, `capacity` 1000 pending calls |
| `createDebounce` | `task`, `waitMs` | Required |
| `createThrottle` | `task`, `waitMs`, `leading`, `trailing` | `leading` true, `trailing` false |
| `createBatch` | `task`, `size`, `waitMs`, `concurrency`, `capacity` | `concurrency` 1, `capacity` 1000 buffered items |

Every control also exposes `stop()`, `drain()` and `close()`. Register it with the server so shutdown stops admission and waits for accepted work:

```ts
server.lifecycle.register(utils.createControlResource("receipt-queue", receiptQueue));
```

## How it behaves

- A full queue returns a failure from `run`. It does not block the caller or drop work silently.
- A debounce replaces earlier pending calls. Their `run` promises resolve with a failure, and only the last input runs.
- A throttle with `leading: true` runs the first call immediately and ignores calls in the window unless `trailing` is true.
- Tasks may return a plain value or a Result. The control unwraps the value for callers.
- Controls hold their state in memory. A restart discards pending work.

## Limits

- Limits apply per process. Two replicas each run their own queue.
- A queue does not retry failed tasks. Use [retries](/guide/features/retries-and-utilities) inside the task when a retry is safe.
- Create controls at module level. A control created inside a handler is new for each request, so it limits nothing.

## Common mistakes

- Using debounce for work where every call must run, such as recording a payment.
- Ignoring the Result of `run`.
- Forgetting to register the control, so shutdown does not wait for queued work.
- Setting `capacity` without deciding what the caller should do when the queue is full.

## See also

- [Shared utilities](/guide/reference/shared-utilities) covers grouped controls, idle cleanup and the retry helper.
- [Production operations](/guide/reference/operations) explains the control lifecycle and shutdown.
- [Weekly report example](/guide/examples/weekly-report) uses a queue inside a scheduled job.
