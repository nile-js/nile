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

Limits cover file count, per-file and total size, filename length, and allowed MIME signatures and extensions. Scanning for malware and checking what a document contains stay in your handler. `enforceContentType` checks the request against the action's `isSpecial.contentType`.

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

export const inspectDocument = createAction({
  name: "inspect",
  description: "Inspect an uploaded document",
  isSpecial: { contentType: "multipart/form-data" },
  handler: inspectDocumentHandler,
});
```

The handler receives `{ fields, files }`. A key repeated with the same kind of value becomes an array. A key used for both a file and text is rejected, whatever the `uploadMode`. The routing field `action` is removed from `fields`, while `intent` and `service` may stay, so read only the fields your action needs.

An upload action's Zod schema describes the **structured payload** `{ fields, files }`. Protect upload actions with the same identity and access rules as any other action.

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

Here `nile` is a [configured client](/guide/basics/client) and `selectedFile` is the File chosen by the user. The client builds the FormData with the routing fields. Leave the Content-Type header unset so Fetch adds the multipart boundary.

For a direct request:

```sh
curl http://localhost:8000/api/services \
  -F 'intent=execute' -F 'service=documents' -F 'action=inspect' \
  -F 'title=Project brief' -F 'document=@./brief.pdf'
```

A parsing or limit failure returns a failure envelope with validation details, and a content-type mismatch can return 415. Files reach your handler in memory: saving them, cleaning them up and authorizing private downloads are up to your application.
