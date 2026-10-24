---
title: "File uploads"
description: "Receive and validate multipart files through an action"
---

Multipart uploads use the same `POST /api/services` endpoint as JSON operations. Nile parses fields and files and applies configured file limits; the action decides what the upload means and where it is stored.

## Set the limits your application needs

```ts
rest: {
  baseUrl: "/api",
  allowedOrigins: ["https://app.example.com"],
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
}
```

Limits cover file count, per-file and total size, filename length, and allowed MIME signatures/extensions. These checks are not malware scanning or application-specific document validation. Enforcing content type checks the request against the action's `isSpecial.contentType`.

## Receive a structured payload

```ts
import { createAction } from "@nilejs/nile";
import type { StructuredPayload } from "@nilejs/nile";
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
    size: document.size,
  });
};

export const inspectDocument = createAction<StructuredPayload>({
  name: "inspect",
  description: "Inspect an uploaded document",
  isSpecial: { contentType: "multipart/form-data" },
  handler: inspectDocumentHandler,
});
```

The handler receives `{ fields, files }`. Repeated same-kind keys become arrays. The current entry point rejects a key used for both a file and text, regardless of `uploadMode`; changing that option does not enable mixed keys. Routing `action` is removed from parsed fields, while `intent` and `service` may remain. Read the application fields you actually need.

If supplying an action Zod schema, describe the **structured payload**, not the JSON shape of a normal action. Add your normal identity and access rules to protected uploads.

## Send from the frontend

```ts
const result = await nile.upload({
  service: "documents",
  action: "inspect",
  files: { document: selectedFile },
  fields: { title: "Project brief" },
});

if (result.isErr) {
  console.error(result.error);
  return;
}

console.log(result.value);
```

Here `nile` is a [configured client](/guide/basics/client) and `selectedFile` is the File chosen by the user. The client creates FormData with the routing fields. Do not manually set a multipart Content-Type header; Fetch supplies its boundary.

For a direct request:

```sh
curl http://localhost:8000/api/services \
  -F 'intent=execute' -F 'service=documents' -F 'action=inspect' \
  -F 'title=Project brief' -F 'document=@./brief.pdf'
```

Upload parsing/limit failures return a failure envelope with validation details; content-type mismatch can return 415. Handle the failure before treating the upload as stored. Nile does not save files automatically; persistence, cleanup and private-download authorization remain application decisions.
