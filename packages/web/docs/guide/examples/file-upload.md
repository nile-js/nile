---
title: "File upload"
description: "Accept a document through a multipart action with count, size and type limits, then send it from a client and from curl"
---

This example adds a `documents.inspect` action to the starter. It accepts one PDF or image with a title, applies the limits in `rest.uploads` and returns the file's name, type and size. A real action would store the file, so the handler is the place to add that step.

## What you need

- The starter project from the [examples overview](/guide/examples), installed with `bun install`.

## 1. Add the client package

```sh
bun add @nilejs/client
```

## 2. Write the upload action

Create `src/services/documents/actions/inspect.ts`. The `isSpecial` setting tells Nile Js to parse the request as form data. The handler reads `payload.files.document` and `payload.fields.title`:

```ts
import { createAction, type StructuredPayload } from "@nilejs/nile";
import { Err, Ok } from "@nilejs/nile/fp";

const inspectDocumentHandler = (payload: StructuredPayload) => {
  const document = payload.files.document;
  const title = payload.fields.title;

  if (!(document instanceof File)) {
    return Err("Send one document");
  }

  if (typeof title !== "string") {
    return Err("A title is required");
  }

  return Ok({
    title: title,
    filename: document.name,
    contentType: document.type,
    size: document.size,
  });
};

export const inspectDocumentAction = createAction<StructuredPayload>({
  name: "inspect",
  description: "Inspect an uploaded PDF or image",
  isSpecial: { contentType: "multipart/form-data" },
  handler: inspectDocumentHandler,
});
```

## 3. Register the service

Replace `src/services/services.config.ts` so the `documents` service sits next to `tasks`:

```ts
import { createServices, type Services } from "@nilejs/nile";
import { inspectDocumentAction } from "./documents/actions/inspect";
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
    name: "documents",
    description: "Document intake",
    actions: [inspectDocumentAction],
  },
]);
```

## 4. Set the limits

Replace `src/index.ts`. The `uploads` block in `rest` sets the file count, the sizes, the filename length and the types the server accepts:

```ts
import { createLogger, createNileServer } from "@nilejs/nile";
import { sql } from "drizzle-orm";
import { Ok, safeTry } from "@nilejs/nile/fp";
import { db } from "@/db/client";
import { services } from "@/services/services.config";

const logger = createLogger("my-app", {
  mode: "dev",
  chunking: "monthly",
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
  rest: {
    baseUrl: "/api",
    host: "localhost",
    port: 8000,
    allowedOrigins: ["http://localhost:8000"],
    enableStatus: true,
    discovery: { enabled: true },
    uploads: {
      enforceContentType: true,
      limits: {
        maxFiles: 3,
        maxFileSize: 5 * 1024 * 1024,
        maxTotalSize: 10 * 1024 * 1024,
        minFileSize: 1,
        maxFilenameLength: 128,
      },
      allow: {
        mimeTypes: ["image/png", "image/jpeg", "application/pdf"],
        extensions: [".png", ".jpg", ".jpeg", ".pdf"],
      },
    },
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

The limits mean: at most three files, five megabytes each, ten megabytes in total, names up to 128 characters, and only PNG, JPEG and PDF files with matching extensions.

## 5. Write a client script

Create `client-upload.ts`. It uploads a small PDF, then tries three requests that should fail: an oversized file, a text file and a missing title:

```ts
import { createNileClient } from "@nilejs/client";
import { z } from "zod";

interface DocumentPayloads {
  documents: {
    inspect: { title: string };
  };
}

const inspectResponseSchema = z.object({
  title: z.string(),
  filename: z.string(),
  contentType: z.string(),
  size: z.number(),
});

const nile = createNileClient<DocumentPayloads>({
  baseUrl: "http://localhost:8000/api",
});

const pdfBytes = new TextEncoder().encode("%PDF-1.4\n% Project brief\n");
const brief = new File([pdfBytes], "brief.pdf", { type: "application/pdf" });

const uploaded = await nile.upload({
  service: "documents",
  action: "inspect",
  files: { document: brief },
  fields: { title: "Project brief" },
});

if (uploaded.isErr) {
  console.error("upload failed:", uploaded.error, JSON.stringify(uploaded.details));
} else {
  const parsed = inspectResponseSchema.parse(uploaded.value);
  console.log("uploaded", parsed.filename, parsed.contentType, parsed.size, parsed.title);
}

const oversized = new File([new Uint8Array(6 * 1024 * 1024)], "large.pdf", {
  type: "application/pdf",
});
const tooLarge = await nile.upload({
  service: "documents",
  action: "inspect",
  files: { document: oversized },
  fields: { title: "Large scan" },
});
console.log("too large isErr:", tooLarge.isErr, tooLarge.isErr ? tooLarge.error : "");
console.log("too large details:", tooLarge.isErr ? JSON.stringify(tooLarge.details) : "");

const textFile = new File(["plain text"], "notes.txt", { type: "text/plain" });
const wrongType = await nile.upload({
  service: "documents",
  action: "inspect",
  files: { document: textFile },
  fields: { title: "Notes" },
});
console.log("wrong type isErr:", wrongType.isErr, wrongType.isErr ? wrongType.error : "");

const missingTitle = await nile.upload({
  service: "documents",
  action: "inspect",
  files: { document: brief },
  fields: {},
});
console.log("missing title isErr:", missingTitle.isErr, missingTitle.isErr ? missingTitle.error : "");
```

## 6. Run the server and the script

Start the server in one terminal:

```sh
bun run dev
```

In a second terminal, run the script:

```sh
bun run client-upload.ts
```

You should see one line for the accepted upload and one for each refused request:

```text
uploaded brief.pdf application/pdf 25 Project brief
too large isErr: true upload limit exceeded
too large details: {"error_category":"validation","limit":"maxFileSize","max":5242880,"files":[{"name":"large.pdf","size":6291456}]}
wrong type isErr: true file type not allowed
missing title isErr: true A title is required
```

The `details` value tells you which limit failed and which file caused it. Show that information to the person uploading, not the raw message alone.

## 7. Send the request with curl

Create a small PDF file, then send it as form data. The routing fields `intent`, `service` and `action` go in the same form:

```sh
printf '%%PDF-1.4\n' > tiny.pdf
curl -s -X POST http://localhost:8000/api/services \
  -F 'intent=execute' -F 'service=documents' -F 'action=inspect' \
  -F 'title=Project brief' -F 'document=@./tiny.pdf;type=application/pdf'
```

You should see the handler's result with HTTP 200:

```json
{"status":true,"message":"Action 'documents.inspect' executed","data":{"title":"Project brief","filename":"tiny.pdf","contentType":"application/pdf","size":9}}
```

Now send the same action as JSON. Nile Js refuses it because the action expects form data:

```sh
curl -s -w "  [HTTP %{http_code}]\n" -X POST http://localhost:8000/api/services \
  -H "Content-Type: application/json" \
  -d '{"intent":"execute","service":"documents","action":"inspect","payload":{"title":"Brief"}}'
```

You should see HTTP 400 and the expected content type:

```json
{"status":false,"message":"Action 'documents.inspect' expects multipart/form-data. Send the request as form data with its files.","data":{"error_category":"validation","expected":"multipart/form-data","received":"application/json"}}  [HTTP 400]
```

## 8. Type-check

```sh
./node_modules/.bin/tsc --noEmit
```

You should see no output and exit with status 0.

## What the check does not do

The limits look at the declared type and the file extension. They do not read the file's bytes. A text file named `fake.png` with the type `image/png` passes, as the curl test below shows if you try it. Check the content in your handler before you trust it.

```sh
printf 'hello' > fake.png
curl -s -X POST http://localhost:8000/api/services \
  -F 'intent=execute' -F 'service=documents' -F 'action=inspect' -F 'title=Fake' \
  -F 'document=@./fake.png;type=image/png'
```

This request returns HTTP 200 with `"contentType":"image/png"`.

## Troubleshooting

- **`upload limit exceeded` for a small file.** Check `maxTotalSize` and the request body limit. A body larger than `rest.protection.maxBodyBytes` (10 MiB by default) is refused before parsing.
- **`expects multipart/form-data` with HTTP 400.** The request was sent as JSON. Send the request as form data, as in step 7.

## See also

- [File uploads](/guide/features/file-uploads) lists every limit and how each failure is reported.
- [Uploads](/guide/basics/uploads) has the full configuration reference.
- [Frontend client](/guide/basics/client) explains the `upload` method's options.
