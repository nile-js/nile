# Call business operations from the frontend

The frontend can call `projects.create` by name while the backend keeps its service/action structure. The standalone client works wherever your application can use Fetch; it does not require React or a shared repository.

```bash
bun add @nilejs/client
```

```typescript
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

const { error, data } = await nile.invoke({
  service: "projects",
  action: "create",
  payload: { name: "Customer portal" },
});

if (error) {
  console.error(error);
} else {
  console.log(data);
}
```

`baseUrl` is the API prefix, not the `/services` endpoint. The client appends `/services` and sends the execution envelope.

## Handle one familiar response

Every method returns `{ error: string | null, data: T | null }`. A successful call has `error: null`. Network failures and timeouts return an error; a server-declared failure retains any error data supplied by the server.

The input map checks service names, action names and payloads. `invoke` currently returns a general record; response types are **not inferred** from the server handler and there is no `invoke<ProjectResponse>()` output-type API. Validate a response when the frontend depends on its shape:

```typescript
import { z } from "zod";

const responseSchema = z.object({
  project: z.object({ id: z.string(), name: z.string() }),
});
const projectResult = responseSchema.safeParse(data);
if (!error && projectResult.success) {
  console.log(projectResult.data.project.name);
}
```

Use this operation in your chosen UI query/mutation library for loading state, caching and invalidation. Those behaviors belong to the UI integration; Nile does not manage a frontend cache.

## Request options

Client configuration accepts `baseUrl`, `credentials`, `headers` and `timeout` (default 30,000 ms). Per-call overrides go inside **`fetchOptions`**:

```typescript
await nile.invoke({
  service: "projects",
  action: "create",
  payload: { name: "Customer portal" },
  fetchOptions: {
    timeout: 5000,
    headers: { Authorization: `Bearer ${accessToken}` },
  },
});
```

`accessToken` comes from your application's authentication flow. Cookie authentication also needs an appropriate server CORS/credential configuration when crossing origins.

## Generate the input map

```bash
bunx @nilejs/cli generate schema --entry src/services/services.config.ts --output src/generated
```

The CLI reads the local service registry and emits `schemas.ts` and `types.ts`. It uses Bun for extraction and does not require publicly enabled discovery. Import `ServicePayloads` from the generated types into `createNileClient<ServicePayloads>`. Share or publish that contract to a separate frontend repository when needed.

Regenerate when input contracts change. See [type-system boundaries](/guide/basics/type-system).

## Discovery and uploads

`explore({ service, action, fetchOptions? })` and `schema(...)` call discovery intents when enabled. They currently send an empty payload and cannot supply `payload.discoverySecret`. Use the [raw-fetch discovery bridge](/guide/basics/discovery-and-agents) for secret-protected discovery.

Use `upload({ service, action, files, fields?, fetchOptions? })` for multipart operations. See [uploads](/guide/basics/uploads).
