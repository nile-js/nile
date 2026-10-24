---
title: "Frontend client"
description: "Call service actions from a browser or server TypeScript app and check each Result before reading its value"
---

The frontend calls `projects.create` by name, while the backend keeps its service and action structure. `@nilejs/client` works wherever your application can use Fetch. It does not require React or a shared repository.

```sh
bun add @nilejs/client
```

```ts
import { createNileClient } from "@nilejs/client";

interface ServicePayloads {
  projects: {
    create: { name: string };
  };
}

const nile = createNileClient<ServicePayloads>({
  baseUrl: "http://localhost:8000/api",
  credentials: "include",
});

const createProject = async (): Promise<void> => {
  const result = await nile.invoke({
    service: "projects",
    action: "create",
    payload: { name: "Customer portal" },
  });

  if (result.isErr) {
    console.error(result.error);
    return;
  }

  console.log(result.value);
};

await createProject();
```

`baseUrl` is the API prefix, not the `/services` endpoint. The client appends `/services` and sends the execution envelope.

## Read the Result

Every client method returns the same Result pattern the server uses. Check `isErr` first:

| Field | Success (`isOk: true`) | Failure (`isErr: true`) |
|---|---|---|
| `isOk`, `isErr` | `true`, `false` | `false`, `true` |
| `value` | The action's data | `null` |
| `error` | `null` | A message string |
| `message` | The server's success message for HTTP calls, such as the action's `successMessage` | Not present |
| `details` | Not present | Any data the server attached to the failure. Validation and lookup failures currently send an empty object, so read `error` for the message. |

Calls do not throw for expected failures. A validation error, a denied action, a timeout and a network failure all arrive as failed Results.

`data` is a deprecated alias: it holds the same value as `value` or `details`. Use `value` and `details` in new code.

The input map checks service names, action names and payloads. `invoke` returns a general record, so response types are **not inferred** from the server handler. Validate the value when the frontend depends on its shape:

```ts
import { z } from "zod";

const projectResponseSchema = z.object({
  project: z.object({ id: z.string(), name: z.string() }),
});

const showProject = async (): Promise<void> => {
  const result = await nile.invoke({
    service: "projects",
    action: "create",
    payload: { name: "Customer portal" },
  });

  if (result.isErr) {
    console.error(result.error);
    return;
  }

  const project = projectResponseSchema.parse(result.value);
  console.log(project.project.name);
};
```

Use this operation in your chosen UI query or mutation library for loading state, caching and invalidation. Nile does not manage a frontend cache.

## Request options

Client configuration accepts `baseUrl`, `credentials`, `headers` and `timeout` (default 30,000 ms). Per-call overrides go inside **`fetchOptions`**:

```ts
const result = await nile.invoke({
  service: "projects",
  action: "create",
  payload: { name: "Customer portal" },
  fetchOptions: {
    timeout: 5000,
    headers: { Authorization: `Bearer ${accessToken}` },
  },
});
```

`accessToken` comes from your application's authentication flow. Cookie authentication also needs an appropriate server CORS and credential configuration when the frontend and API use different origins.

## Generate the input map

```sh
bunx @nilejs/cli generate schema --entry src/services/services.config.ts --output src/generated
```

The CLI reads the local service registry and writes `schemas.ts` and `types.ts`. It runs a Bun subprocess for extraction and does not require discovery to be enabled. `types.ts` exports `ServicePayloads`; import it into `createNileClient<ServicePayloads>`. Share or publish that contract to a separate frontend repository when needed.

Regenerate the input map when input contracts change. See [type-system boundaries](/guide/basics/type-system).

## Discovery and uploads

`explore({ service, action, fetchOptions? })` and `schema({ service, action, fetchOptions? })` call discovery intents when discovery is enabled. Both return a Result. They send an empty payload, so they cannot supply `payload.discoverySecret`. Use the [raw-fetch discovery bridge](/guide/basics/discovery-and-agents) for secret-protected discovery.

`upload({ service, action, files, fields?, fetchOptions? })` sends multipart operations and returns a Result as well. See [uploads](/guide/basics/uploads).
